const SEOUL_CENTER = { lat: 37.5665, lng: 126.978 };

const state = {
  map: null,
  markers: [],
  clustering: null,
  infoWindow: null,
  selectedCategory: "",
};

// 클러스터 마커 아이콘: 개수 구간(10/100/1000)에 따라 점점 커지는 원형 배지 4단계.
const CLUSTER_ICON_SIZES = [32, 40, 52, 64];
const CLUSTER_INDEX_GENERATOR = [10, 100, 1000];

function makeClusterIcon(size) {
  return {
    content: `<div class="cluster-marker" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.24)}px;"></div>`,
    size: new naver.maps.Size(size, size),
    anchor: new naver.maps.Point(size / 2, size / 2),
  };
}

function initMap() {
  if (typeof naver === "undefined") {
    return null;
  }
  const map = new naver.maps.Map("map", {
    center: new naver.maps.LatLng(SEOUL_CENTER.lat, SEOUL_CENTER.lng),
    zoom: 11,
  });
  state.infoWindow = new naver.maps.InfoWindow({ anchorSkew: true });
  return map;
}

function clearMarkers() {
  if (state.clustering) {
    state.clustering.setMap(null);
    state.clustering = null;
  }
  state.markers.forEach((marker) => marker.setMap(null));
  state.markers = [];
}

function buildInfoContent(place) {
  const safe = (value) => (value ? value.replace(/</g, "&lt;") : "");
  const link = place.url
    ? `<a href="${safe(place.url)}" target="_blank" rel="noopener">바로가기</a>`
    : "";
  return `
    <div style="padding:10px 12px;min-width:180px;">
      <strong>${safe(place.name)}</strong><br/>
      <span style="font-size:12px;color:#666;">${safe(place.category)}</span><br/>
      <span style="font-size:12px;">${safe(place.address)}</span>
      ${place.description ? `<p style="font-size:12px;margin:6px 0 0;">${safe(place.description)}</p>` : ""}
      ${link}
    </div>
  `;
}

function focusPlace(place) {
  if (!state.map) return;
  // 클러스터 안에 숨어있는 마커일 수도 있으므로, 마커가 아니라 좌표에 직접 InfoWindow를 띄운다.
  const position = new naver.maps.LatLng(place.lat, place.lng);
  state.map.panTo(position);
  state.infoWindow.setContent(buildInfoContent(place));
  state.infoWindow.open(state.map, position);
}

function renderMarkers(places) {
  clearMarkers();

  const markers = places.map((place) => {
    const position = new naver.maps.LatLng(place.lat, place.lng);
    const marker = new naver.maps.Marker({ position, title: place.name });
    naver.maps.Event.addListener(marker, "click", () => focusPlace(place));
    return marker;
  });

  state.markers = markers;
  if (markers.length === 0) return;

  // 마커를 지도에 바로 올리지 않고 클러스터링에 맡긴다: 화면에 보이는 만큼만 그려서
  // 수천 개의 마커를 한꺼번에 렌더링할 때의 성능 저하를 막는다.
  state.clustering = new MarkerClustering({
    map: state.map,
    markers,
    gridSize: 100,
    minClusterSize: 31,
    maxZoom: 15,
    disableClickZoom: false,
    icons: CLUSTER_ICON_SIZES.map(makeClusterIcon),
    indexGenerator: CLUSTER_INDEX_GENERATOR,
    stylingFunction: (clusterMarker, count) => {
      const badge = clusterMarker.getElement().firstElementChild;
      if (badge) badge.textContent = count;
    },
  });
}

function renderList(places) {
  const listEl = document.getElementById("place-list");
  listEl.innerHTML = "";

  if (places.length === 0) {
    listEl.innerHTML = '<div class="empty">검색 결과가 없습니다.</div>';
    return;
  }

  places.forEach((place, index) => {
    const item = document.createElement("div");
    item.className = "place-item";
    item.innerHTML = `
      <div class="place-name">${place.name}</div>
      <div class="place-meta">${place.category || ""} ${place.address ? "· " + place.address : ""}</div>
    `;
    item.addEventListener("click", () => focusPlace(place, state.markers[index]));
    listEl.appendChild(item);
  });
}

async function fetchPlaces(query, category) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (category) params.set("category", category);
  const qs = params.toString();
  const url = qs ? `/api/places?${qs}` : "/api/places";
  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "장소 정보를 불러오지 못했습니다.");
  }
  return data.places;
}

async function fetchCategories() {
  const response = await fetch("/api/categories");
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "카테고리 정보를 불러오지 못했습니다.");
  }
  return data.categories;
}

async function search(query) {
  const countEl = document.getElementById("result-count");
  // 검색어가 있으면 카테고리 필터는 무시하고 전체에서 검색한다.
  const categoryParam = query ? "" : state.selectedCategory;
  setActiveFilterButton(categoryParam);
  try {
    const places = await fetchPlaces(query, categoryParam);
    if (state.map) {
      renderMarkers(places);
    }
    renderList(places);
    countEl.textContent = `${places.length}개 결과`;
  } catch (err) {
    countEl.textContent = "";
    document.getElementById("place-list").innerHTML = `<div class="empty">${err.message}</div>`;
  }
}

function setActiveFilterButton(category) {
  const buttons = document.querySelectorAll("#category-filter button");
  buttons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.category === category);
  });
}

function selectCategory(category) {
  state.selectedCategory = category;
  // 카테고리를 고르면 검색어는 비워서 카테고리 필터가 바로 적용되게 한다.
  const input = document.getElementById("search-input");
  input.value = "";
  search("");
}

function renderCategoryFilter(categories) {
  const el = document.getElementById("category-filter");
  el.innerHTML = "";

  Object.keys(categories).forEach((top) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = top;
    button.dataset.category = top;
    button.addEventListener("click", () => selectCategory(top));
    el.appendChild(button);
  });
}

function setupSearchHandlers() {
  const input = document.getElementById("search-input");
  const button = document.getElementById("search-button");

  const runSearch = () => search(input.value.trim());

  button.addEventListener("click", runSearch);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") runSearch();
  });
}

window.addEventListener("DOMContentLoaded", async () => {
  state.map = initMap();
  setupSearchHandlers();
  try {
    const categories = await fetchCategories();
    renderCategoryFilter(categories);
    state.selectedCategory = Object.keys(categories)[0] || "";
  } catch (err) {
    console.error(err.message);
  }
  search("");
});
