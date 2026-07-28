import os

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request

from categories import CategoryTree
from local_store import LocalPlacesStore

load_dotenv()

app = Flask(__name__)
app.json.sort_keys = False  # 카테고리 등 응답 순서를 원본(yaml/코드) 순서 그대로 유지

NAVER_MAP_CLIENT_ID = os.environ.get("NAVER_MAP_CLIENT_ID", "")

category_tree = CategoryTree(os.path.join(os.path.dirname(__file__), "categories.yaml"))

# Google Sheets를 매 요청마다 조회하지 않도록, export_places.py로 미리 내보낸 로컬 CSV를 읽는다.
# 시트 원본이 바뀌면 export_places.py를 다시 실행해서 이 파일을 갱신해야 한다.
store = LocalPlacesStore(os.path.join(os.path.dirname(__file__), "data", "places.csv"))


@app.route("/")
def index():
    return render_template("index.html", naver_map_client_id=NAVER_MAP_CLIENT_ID)


@app.route("/api/categories")
def api_categories():
    return jsonify({"categories": category_tree.as_dict()})


@app.route("/api/districts")
def api_districts():
    try:
        places = store.get_places()
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502

    # 행정구 -> 동 목록 (실제 데이터에 존재하는 값만, 가나다순)
    districts = {}
    for place in places:
        district = place.get("district", "").strip()
        dong = place.get("dong", "").strip()
        if not district:
            continue
        dongs = districts.setdefault(district, set())
        if dong:
            dongs.add(dong)

    result = {
        district: sorted(dongs) for district, dongs in sorted(districts.items())
    }
    return jsonify({"districts": result})


@app.route("/api/places")
def api_places():
    query = request.args.get("q", "").strip().lower()
    top_categories = {c.strip() for c in request.args.getlist("category") if c.strip()}
    district = request.args.get("district", "").strip()
    dong = request.args.get("dong", "").strip()

    try:
        places = store.get_places()
    except Exception as exc:  # 로컬 CSV가 없는 등 실패 시 500 대신 에러 메시지를 명확히 전달
        return jsonify({"error": str(exc)}), 502

    places = [
        {**place, "topCategory": category_tree.top_of(place["category"])}
        for place in places
    ]

    if top_categories:
        places = [place for place in places if place["topCategory"] in top_categories]

    if district:
        places = [place for place in places if place["district"] == district]

    if dong:
        places = [place for place in places if place["dong"] == dong]

    if query:
        places = [
            place
            for place in places
            if query in place["name"].lower()
            or query in place["address"].lower()
            or query in place["category"].lower()
        ]

    return jsonify({"count": len(places), "places": places})


@app.route("/api/places/refresh", methods=["POST"])
def api_places_refresh():
    try:
        places = store.get_places(force_refresh=True)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502
    return jsonify({"count": len(places)})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
