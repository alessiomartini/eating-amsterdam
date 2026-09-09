// Wrapper attorno a Leaflet: cluster di marker colorati per fascia di prezzo.

import { priceBand } from './data.js';

const AMSTERDAM = [52.3728, 4.8936];

let map;
let cluster;
let userMarker;
const markers = new Map();
let activeId = null;

function iconFor(place, active) {
  return L.divIcon({
    className: '',
    html: `<div class="marker-pin ${priceBand(place.shown?.amount)}${active ? ' active' : ''}"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

export function initMap(container, { onSelect } = {}) {
  map = L.map(container, { zoomControl: true, preferCanvas: true }).setView(AMSTERDAM, 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  cluster = L.markerClusterGroup({
    maxClusterRadius: 45,
    showCoverageOnHover: false,
    disableClusteringAtZoom: 17,
  });
  cluster.on('click', (event) => onSelect?.(event.layer.options.placeId));
  map.addLayer(cluster);

  return map;
}

export function setPlaces(places) {
  cluster.clearLayers();
  markers.clear();

  const layers = places.map((place) => {
    const marker = L.marker([place.lat, place.lon], {
      icon: iconFor(place, place.id === activeId),
      placeId: place.id,
      title: place.name,
    });
    markers.set(place.id, { marker, place });
    return marker;
  });

  cluster.addLayers(layers);
}

export function highlight(id) {
  for (const targetId of [activeId, id]) {
    const entry = targetId && markers.get(targetId);
    if (entry) entry.marker.setIcon(iconFor(entry.place, targetId === id));
  }
  activeId = id;
}

export function focusPlace(place, { zoom = 17 } = {}) {
  if (!map) return;
  map.setView([place.lat, place.lon], Math.max(map.getZoom(), zoom), { animate: true });
  const entry = markers.get(place.id);
  if (entry) cluster.zoomToShowLayer(entry.marker, () => {});
}

export function showUser(position) {
  if (!map) return;
  userMarker?.remove();
  userMarker = L.circleMarker([position.lat, position.lon], {
    radius: 7,
    color: '#ff8a3d',
    fillColor: '#ff8a3d',
    fillOpacity: 0.9,
    weight: 2,
  })
    .addTo(map)
    .bindTooltip('Sei qui');
  map.setView([position.lat, position.lon], 15);
}

export function invalidate() {
  map?.invalidateSize();
}
