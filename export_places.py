"""Google Sheets에서 장소 데이터를 받아 로컬 CSV(data/places.csv)로 내보낸다.
서버는 이 파일만 읽으므로, 시트 원본이 바뀌었을 때 이 스크립트를 다시 실행해야 반영된다.

사용법: python export_places.py
"""

import csv
import os

from dotenv import load_dotenv

from sheets import SheetPlacesStore

load_dotenv()

OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "data", "places.csv")
FIELDNAMES = [
    "name",
    "address",
    "jibun_address",
    "district",
    "dong",
    "category",
    "description",
    "url",
    "lat",
    "lng",
]


def main():
    store = SheetPlacesStore(
        sheet_id=os.environ.get("GOOGLE_SHEET_ID", ""),
        sheet_name=os.environ.get("GOOGLE_SHEET_NAME", ""),
        gid=os.environ.get("GOOGLE_SHEET_GID", "0"),
        column_map={
            "name": os.environ.get("GOOGLE_SHEET_COL_NAME", ""),
            "lat": os.environ.get("GOOGLE_SHEET_COL_LAT", ""),
            "lng": os.environ.get("GOOGLE_SHEET_COL_LNG", ""),
            "address": os.environ.get("GOOGLE_SHEET_COL_ADDRESS", ""),
            "jibun_address": os.environ.get("GOOGLE_SHEET_COL_JIBUN_ADDRESS", ""),
            "district": os.environ.get("GOOGLE_SHEET_COL_DISTRICT", ""),
            "dong": os.environ.get("GOOGLE_SHEET_COL_DONG", ""),
            "category": os.environ.get("GOOGLE_SHEET_COL_CATEGORY", ""),
            "description": os.environ.get("GOOGLE_SHEET_COL_DESCRIPTION", ""),
            "url": os.environ.get("GOOGLE_SHEET_COL_URL", ""),
        },
    )
    places = store.get_places(force_refresh=True)

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(places)

    print(f"{len(places)}개 장소를 {OUTPUT_PATH}에 저장했습니다.")


if __name__ == "__main__":
    main()
