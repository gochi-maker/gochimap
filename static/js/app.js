const SEOUL_CENTER = { lat: 37.5665, lng: 126.978 };

const state = {
  map: null,
  markers: [],
  clustering: null,
  infoWindow: null,
  selectedCategories: new Set(),
  selectedDistrict: "",
  selectedDong: "",
  districts: {},
};

// 클러스터 마커 아이콘: 개수 구간(10/100/1000)에 따라 점점 커지는 원형 배지 4단계.
const CLUSTER_ICON_SIZES = [32, 40, 52, 64];
const CLUSTER_INDEX_GENERATOR = [10, 100, 1000];
const PHONE_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.11.37 2.3.56 3.58.56a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.28.19 2.47.56 3.58a1 1 0 0 1-.24 1.01l-2.2 2.2Z"></path>
  </svg>
`;
const MAP_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2C8.14 2 5 5.14 5 9c0 5.02 6.15 11.97 6.41 12.26a.8.8 0 0 0 1.18 0C12.85 20.97 19 14.02 19 9c0-3.86-3.14-7-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"></path>
  </svg>
`;

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

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => {
    const entityMap = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entityMap[char];
  });
}

function normalizeExternalUrl(value) {
  const url = String(value || "").trim();
  return /^https?:\/\//i.test(url) ? url : "";
}

function normalizePhoneHref(value) {
  return String(value || "").replace(/[^0-9+]/g, "");
}

function buildPhoneLink(phone) {
  if (!phone) {
    return "";
  }

  const href = normalizePhoneHref(phone);
  if (!href) {
    return "";
  }

  return `
    <a class="place-inline-link place-inline-link-phone" href="tel:${escapeHtml(href)}">
      <span class="place-inline-icon" aria-hidden="true">${PHONE_ICON}</span>
      <span>${escapeHtml(phone)}</span>
    </a>
  `;
}

function buildKakaoLink(url) {
  const href = normalizeExternalUrl(url);
  if (!href) {
    return "";
  }

  return `
    <a class="place-inline-link place-inline-link-kakao" href="${escapeHtml(href)}" target="_blank" rel="noopener">
      <span class="place-inline-icon place-inline-icon-kakao" aria-hidden="true">${MAP_ICON}</span>
      <span>카카오맵</span>
    </a>
  `;
}

function buildUrlLink(url) {
  const href = normalizeExternalUrl(url);
  if (!href) {
    return "";
  }

  return `
    <a class="place-inline-link" href="${escapeHtml(href)}" target="_blank" rel="noopener">
      <span>링크 바로가기</span>
    </a>
  `;
}

function buildContactRow(place) {
  const items = [buildPhoneLink(place.tel), buildKakaoLink(place.kakaomap)].filter(Boolean);
  if (items.length === 0) {
    return "";
  }

  return `<div class="place-contact-row">${items.join("")}</div>`;
}

function bindItemLinks(container) {
  container.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", (event) => event.stopPropagation());
  });
}

function buildInfoContent(place) {
  const actions = [buildKakaoLink(place.kakaomap), buildUrlLink(place.url)].filter(Boolean);
  return `
    <div class="place-info-window">
      <strong class="place-info-window-name">${escapeHtml(place.name)}</strong>
      <span class="place-info-window-category">${escapeHtml(place.category)}</span>
      <span class="place-info-window-address">${escapeHtml(place.address)}</span>
      ${place.description ? `<p class="place-info-window-description">${escapeHtml(place.description)}</p>` : ""}
      ${place.tel ? `<div class="place-info-window-contact">${buildPhoneLink(place.tel)}</div>` : ""}
      ${actions.length > 0 ? `<div class="place-contact-row place-info-window-actions">${actions.join("")}</div>` : ""}
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

function resetMapViewport() {
  if (!state.map) return;
  state.infoWindow.close();
  state.map.setCenter(new naver.maps.LatLng(SEOUL_CENTER.lat, SEOUL_CENTER.lng));
  state.map.setZoom(11);
}

function focusMapToPlaces(places) {
  if (!state.map) return;

  if (!places.length) {
    if (!state.selectedDistrict && !state.selectedDong) {
      resetMapViewport();
    }
    return;
  }

  state.infoWindow.close();

  if (places.length === 1) {
    const position = new naver.maps.LatLng(places[0].lat, places[0].lng);
    state.map.panTo(position);
    state.map.setZoom(15);
    return;
  }

  const firstPosition = new naver.maps.LatLng(places[0].lat, places[0].lng);
  const bounds = new naver.maps.LatLngBounds(firstPosition, firstPosition);

  places.slice(1).forEach((place) => {
    bounds.extend(new naver.maps.LatLng(place.lat, place.lng));
  });

  state.map.fitBounds(bounds);
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
    const meta = `${place.category || ""}${place.address ? ` ${place.category ? "· " : ""}${place.address}` : ""}`;
    item.innerHTML = `
      <div class="place-name">${escapeHtml(place.name)}</div>
      <div class="place-meta">${escapeHtml(meta.trim())}</div>
      ${buildContactRow(place)}
    `;
    item.addEventListener("click", () => focusPlace(place, state.markers[index]));
    bindItemLinks(item);
    listEl.appendChild(item);
  });
}

async function fetchPlaces(query, categories, district, dong) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  categories.forEach((category) => params.append("category", category));
  if (district) params.set("district", district);
  if (dong) params.set("dong", dong);
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

async function fetchDistricts() {
  const response = await fetch("/api/districts");
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "행정구 정보를 불러오지 못했습니다.");
  }
  return data.districts;
}

async function search(query, options = {}) {
  const countEl = document.getElementById("result-count");
  // 검색어가 있으면 카테고리 필터는 무시하고 전체에서 검색한다.
  const categoryParams = query ? [] : Array.from(state.selectedCategories);
  setActiveFilterButtons(categoryParams);
  try {
    const places = await fetchPlaces(query, categoryParams, state.selectedDistrict, state.selectedDong);
    if (state.map) {
      renderMarkers(places);
      if (options.focusViewport) {
        if (state.selectedDistrict || state.selectedDong) {
          focusMapToPlaces(places);
        } else {
          resetMapViewport();
        }
      }
    }
    renderList(places);
    countEl.textContent = `${places.length}개 결과`;
  } catch (err) {
    countEl.textContent = "";
    document.getElementById("place-list").innerHTML = `<div class="empty">${err.message}</div>`;
  }
}

function setActiveFilterButtons(categories) {
  const active = new Set(categories);
  const buttons = document.querySelectorAll("#category-filter button");
  buttons.forEach((btn) => {
    btn.classList.toggle("active", active.has(btn.dataset.category));
  });
}

function toggleCategory(category) {
  // 여러 유형을 함께 선택할 수 있도록 클릭할 때마다 켜고 끈다. 아무것도 선택 안 하면 전체를 보여준다.
  if (state.selectedCategories.has(category)) {
    state.selectedCategories.delete(category);
  } else {
    state.selectedCategories.add(category);
  }
  // 필터를 바꾸면 검색어는 비워서 필터가 바로 적용되게 한다.
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
    button.addEventListener("click", () => toggleCategory(top));
    el.appendChild(button);
  });
}

function populateDongOptions(district) {
  const dongSelect = document.getElementById("dong-select");
  dongSelect.innerHTML = '<option value="">동 전체</option>';

  const dongs = state.districts[district] || [];
  dongSelect.disabled = dongs.length === 0;
  dongs.forEach((dong) => {
    const option = document.createElement("option");
    option.value = dong;
    option.textContent = dong;
    dongSelect.appendChild(option);
  });
}

function renderLocationFilter(districts) {
  state.districts = districts;

  const districtSelect = document.getElementById("district-select");
  Object.keys(districts).forEach((district) => {
    const option = document.createElement("option");
    option.value = district;
    option.textContent = district;
    districtSelect.appendChild(option);
  });

  districtSelect.addEventListener("change", () => {
    state.selectedDistrict = districtSelect.value;
    state.selectedDong = "";
    populateDongOptions(state.selectedDistrict);
    search(document.getElementById("search-input").value.trim(), {
      focusViewport: true,
    });
  });

  const dongSelect = document.getElementById("dong-select");
  dongSelect.addEventListener("change", () => {
    state.selectedDong = dongSelect.value;
    search(document.getElementById("search-input").value.trim(), {
      focusViewport: true,
    });
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

function setupHelpDialog() {
  const dialog = document.getElementById("help-dialog");
  const openButton = document.getElementById("help-button");
  const closeButtons = dialog.querySelectorAll("[data-close-help]");

  const closeDialog = () => {
    dialog.hidden = true;
    document.body.style.overflow = "";
    openButton.setAttribute("aria-expanded", "false");
    openButton.focus();
  };

  const openDialog = () => {
    dialog.hidden = false;
    document.body.style.overflow = "hidden";
    openButton.setAttribute("aria-expanded", "true");
    dialog.querySelector(".close-button").focus();
  };

  openButton.addEventListener("click", openDialog);
  closeButtons.forEach((button) => {
    button.addEventListener("click", closeDialog);
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      closeDialog();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dialog.hidden) {
      closeDialog();
    }
  });
}

window.addEventListener("DOMContentLoaded", async () => {
  state.map = initMap();
  setupSearchHandlers();
  setupHelpDialog();
  try {
    const categories = await fetchCategories();
    renderCategoryFilter(categories);
    const firstCategory = Object.keys(categories)[0];
    if (firstCategory) state.selectedCategories.add(firstCategory);
  } catch (err) {
    console.error(err.message);
  }
  try {
    const districts = await fetchDistricts();
    renderLocationFilter(districts);
  } catch (err) {
    console.error(err.message);
  }
  search("");
});
