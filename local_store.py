"""export_places.py로 미리 내보낸 로컬 CSV에서 장소 데이터를 읽어와 캐시하는 저장소.
Google Sheets에 요청하지 않으므로 매 요청마다 네트워크 지연이 발생하지 않는다."""

import csv
import os


class LocalPlacesStore:
    """CSV 파일을 메모리에 캐시하고, 파일이 바뀐 경우에만(mtime 기준) 다시 읽는다."""

    def __init__(self, csv_path):
        self.csv_path = csv_path
        self._cache = []
        self._mtime = None

    def get_places(self, force_refresh=False):
        if not os.path.exists(self.csv_path):
            raise FileNotFoundError(
                f"{self.csv_path} 파일이 없습니다. "
                "먼저 `python export_places.py`를 실행해 데이터를 내보내주세요."
            )

        mtime = os.path.getmtime(self.csv_path)
        if force_refresh or mtime != self._mtime:
            self._refresh(mtime)
        return self._cache

    def _refresh(self, mtime):
        with open(self.csv_path, encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            places = []
            for row in reader:
                try:
                    lat = float(row["lat"])
                    lng = float(row["lng"])
                except (KeyError, ValueError, TypeError):
                    continue

                places.append(
                    {
                        "name": row.get("name", ""),
                        "address": row.get("address", ""),
                        "category": row.get("category", ""),
                        "description": row.get("description", ""),
                        "url": row.get("url", ""),
                        "lat": lat,
                        "lng": lng,
                    }
                )

        self._cache = places
        self._mtime = mtime
