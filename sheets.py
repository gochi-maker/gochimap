"""공개 구글 시트에서 장소 데이터를 읽어와 정규화하는 모듈."""

import csv
import io
import time
from urllib.parse import quote

import requests

# 시트 헤더가 한글/영문 등 여러 형태로 들어올 수 있어 별칭을 정규화 키에 매핑한다.
# (컬럼 위치를 지정하지 않았을 때 쓰는 기본 방식)
FIELD_ALIASES = {
    "name": {"name", "이름", "명칭", "장소명", "장소", "상호명", "상호"},
    "address": {"address", "주소"},
    "jibun_address": {"jibun_address", "지번주소", "지번 주소", "지번"},
    "district": {"district", "행정구", "구", "시군구", "시군구명"},
    "dong": {"dong", "동", "법정동", "법정동명"},
    "category": {"category", "카테고리", "분류", "태그"},
    "lat": {"lat", "latitude", "위도"},
    "lng": {"lng", "lon", "longitude", "경도"},
    "description": {"description", "설명", "메모", "소개"},
    "url": {"url", "link", "링크", "홈페이지"},
    "tel": {"tel", "phone", "전화", "전화번호", "연락처"},
    "kakaomap": {
        "kakaomap",
        "kakao_map",
        "카카오맵",
        "카카오맵링크",
        "카카오맵 링크",
        "카카오맵url",
        "카카오맵 url",
    },
}

REQUIRED_FIELDS = ("name", "lat", "lng")

# GOOGLE_SHEET_ID를 아직 설정하지 않았을 때 지도 렌더링을 확인해볼 수 있도록 제공하는 샘플 데이터.
SAMPLE_PLACES = [
    {
        "name": "서울시청",
        "address": "서울 중구 세종대로 110",
        "jibun_address": "서울 중구 태평로1가 31",
        "district": "중구",
        "dong": "태평로1가",
        "category": "공공기관",
        "description": "서울특별시청 본관 (샘플 데이터)",
        "url": "",
        "tel": "",
        "kakaomap": "",
        "lat": 37.5665,
        "lng": 126.9780,
    },
    {
        "name": "강남역",
        "address": "서울 강남구 강남대로 396",
        "jibun_address": "서울 강남구 역삼동 858",
        "district": "강남구",
        "dong": "역삼동",
        "category": "교통",
        "description": "지하철 2호선/신분당선 환승역 (샘플 데이터)",
        "url": "",
        "tel": "",
        "kakaomap": "",
        "lat": 37.4979,
        "lng": 127.0276,
    },
    {
        "name": "경복궁",
        "address": "서울 종로구 사직로 161",
        "jibun_address": "서울 종로구 세종로 1-1",
        "district": "종로구",
        "dong": "세종로",
        "category": "관광지",
        "description": "조선 왕조의 법궁 (샘플 데이터)",
        "url": "",
        "tel": "",
        "kakaomap": "",
        "lat": 37.5796,
        "lng": 126.9770,
    },
]


def col_letter_to_index(letter):
    """'C' -> 2, 'AM' -> 38 처럼 스프레드시트 컬럼 문자를 0-based 인덱스로 변환."""
    letter = letter.strip().upper()
    index = 0
    for ch in letter:
        index = index * 26 + (ord(ch) - ord("A") + 1)
    return index - 1


def _index_to_col_letter(index):
    """0-based 인덱스를 스프레드시트 컬럼 문자로 변환 (col_letter_to_index의 역함수)."""
    index += 1
    letters = ""
    while index > 0:
        index, remainder = divmod(index - 1, 26)
        letters = chr(65 + remainder) + letters
    return letters


def _normalize_key(raw_key):
    key = (raw_key or "").strip().lower()
    for normalized, aliases in FIELD_ALIASES.items():
        if key in aliases:
            return normalized
    return None


def _build_column_select(column_map):
    """column_map에서 지정된 필드만, 지정된 순서대로 gviz select 절을 만든다.
    시트 전체(수십 개 컬럼)를 받는 대신 실제로 쓰는 컬럼만 받아 응답 크기/시간을 줄인다."""
    fields_order = [f for f in FIELD_ALIASES if (column_map.get(f) or "").strip()]
    letters = [column_map[f].strip().upper() for f in fields_order]
    return fields_order, "select " + ",".join(letters)


def _csv_export_url(sheet_id, sheet_name, gid, tq=None):
    if sheet_name:
        # 시트(탭) 이름으로 바로 지정해서 가져온다. gid를 몰라도 된다.
        url = (
            f"https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq"
            f"?tqx=out:csv&sheet={quote(sheet_name)}"
        )
        if tq:
            url += f"&tq={quote(tq)}"
        return url
    # gid 기반 export는 select 쿼리를 지원하지 않아 시트 전체를 받는다.
    return f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"


def _row_value(row, index):
    if index is None or index >= len(row):
        return ""
    return (row[index] or "").strip()


def _parse_rows_by_column_letters(csv_text, column_map):
    """column_map: {"name": "C", "lat": "AN", "lng": "AM", ...} 처럼 필드->컬럼 문자.
    첫 번째 행은 헤더로 간주하고 건너뛴다."""
    index_map = {field: col_letter_to_index(letter) for field, letter in column_map.items() if letter}

    reader = csv.reader(io.StringIO(csv_text))
    rows = list(reader)
    places = []
    for row in rows[1:]:
        name = _row_value(row, index_map.get("name"))
        lat_raw = _row_value(row, index_map.get("lat"))
        lng_raw = _row_value(row, index_map.get("lng"))

        if not name or not lat_raw or not lng_raw:
            continue

        try:
            lat = float(lat_raw)
            lng = float(lng_raw)
        except ValueError:
            continue

        places.append(
            {
                "name": name,
                "address": _row_value(row, index_map.get("address")),
                "jibun_address": _row_value(row, index_map.get("jibun_address")),
                "district": _row_value(row, index_map.get("district")),
                "dong": _row_value(row, index_map.get("dong")),
                "category": _row_value(row, index_map.get("category")),
                "description": _row_value(row, index_map.get("description")),
                "url": _row_value(row, index_map.get("url")),
                "tel": _row_value(row, index_map.get("tel")),
                "kakaomap": _row_value(row, index_map.get("kakaomap")),
                "lat": lat,
                "lng": lng,
            }
        )
    return places


def _parse_rows_by_header(csv_text):
    reader = csv.DictReader(io.StringIO(csv_text))
    places = []
    for row in reader:
        normalized = {}
        for raw_key, value in row.items():
            field = _normalize_key(raw_key)
            if field:
                normalized[field] = (value or "").strip()

        if not all(normalized.get(f) for f in REQUIRED_FIELDS):
            continue

        try:
            lat = float(normalized["lat"])
            lng = float(normalized["lng"])
        except ValueError:
            continue

        places.append(
            {
                "name": normalized.get("name", ""),
                "address": normalized.get("address", ""),
                "jibun_address": normalized.get("jibun_address", ""),
                "district": normalized.get("district", ""),
                "dong": normalized.get("dong", ""),
                "category": normalized.get("category", ""),
                "description": normalized.get("description", ""),
                "url": normalized.get("url", ""),
                "tel": normalized.get("tel", ""),
                "kakaomap": normalized.get("kakaomap", ""),
                "lat": lat,
                "lng": lng,
            }
        )
    return places


class SheetPlacesStore:
    """구글 시트 CSV를 주기적으로 가져와 메모리에 캐시하는 저장소."""

    def __init__(self, sheet_id, sheet_name="", gid="0", ttl_seconds=300, column_map=None):
        self.sheet_id = sheet_id
        self.sheet_name = sheet_name
        self.gid = gid
        self.ttl_seconds = ttl_seconds
        # column_map이 채워져 있으면(예: {"name": "C", "lat": "AN", "lng": "AM"})
        # 헤더 이름 대신 컬럼 위치로 파싱한다.
        self.column_map = column_map or {}
        self._cache = []
        self._fetched_at = 0

    def _is_stale(self):
        return (time.time() - self._fetched_at) > self.ttl_seconds

    def get_places(self, force_refresh=False):
        if force_refresh or not self._cache or self._is_stale():
            self._refresh()
        return self._cache

    def _refresh(self):
        if not self.sheet_id:
            # GOOGLE_SHEET_ID 설정 전에도 지도 동작을 확인할 수 있도록 샘플 데이터로 대체한다.
            self._cache = SAMPLE_PLACES
            self._fetched_at = time.time()
            return

        has_position_mapping = all(self.column_map.get(f) for f in REQUIRED_FIELDS)

        if has_position_mapping and self.sheet_name:
            # 시트 전체(수십 개 컬럼)를 받는 대신, 실제로 쓰는 컬럼만 select로 좁혀서 받는다.
            # 컬럼 수/응답 크기가 크게 줄어 시트가 큰 경우 다운로드 시간이 크게 단축된다.
            fields_order, tq = _build_column_select(self.column_map)
            url = _csv_export_url(self.sheet_id, self.sheet_name, self.gid, tq=tq)
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            csv_text = response.content.decode("utf-8-sig")

            # select로 좁힌 응답은 요청한 순서대로 컬럼이 오므로, 위치 기반 파서에
            # 그대로 재사용할 수 있도록 각 필드를 그 위치의 컬럼 문자로 바꿔 넘긴다.
            positional_map = {
                field: _index_to_col_letter(i) for i, field in enumerate(fields_order)
            }
            self._cache = _parse_rows_by_column_letters(csv_text, positional_map)
        else:
            url = _csv_export_url(self.sheet_id, self.sheet_name, self.gid)
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            # 구글이 BOM을 붙여서 주는 경우가 있어 utf-8-sig로 디코딩한다.
            csv_text = response.content.decode("utf-8-sig")

            if has_position_mapping:
                self._cache = _parse_rows_by_column_letters(csv_text, self.column_map)
            else:
                self._cache = _parse_rows_by_header(csv_text)

        self._fetched_at = time.time()
