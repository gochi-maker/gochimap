const SEOUL_CENTER = { lat: 37.5665, lng: 126.978 };

const state = {
  map: null,
  markers: [],
  infoWindow: null,
  selectedCategory: "",
};

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

function focusPlace(place, marker) {
  if (!state.map) return;
  state.map.panTo(new naver.maps.LatLng(place.lat, place.lng));
  state.infoWindow.setContent(buildInfoContent(place));
  state.infoWindow.open(state.map, marker);
}

function renderMarkers(places) {
  clearMarkers();
  places.forEach((place) => {
    const position = new naver.maps.LatLng(place.lat, place.lng);
    const marker = new naver.maps.Marker({ position, map: state.map, title: place.name });
    naver.maps.Event.addListener(marker, "click", () => focusPlace(place, marker));
    state.markers.push(marker);
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
