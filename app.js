/* === НУЖНО ПОДСТАВИТЬ URL GAS WEBAPP === */
const GAS_URL = "https://script.google.com/macros/s/AKfycbyCQ00fscLZKX2cS7FEDbVCVw9mpzZDDTxExitpbKSThrzoyyL4VUmjpve0mawtH3NZ/exec";

/* === Остальные константы === */
let map, allMarkers = [], routeMode = false, routePoints = [], currentRoute = null, routeRequestTimer = null;
const ROUTE_TIMEOUT_MS = 15000; // 15s

function logDebug(msg, level = 'info') {
  const time = new Date().toLocaleTimeString();
  console[level === 'error' ? 'error' : 'log'](`[${time}] ${msg}`);
  const dbg = document.getElementById('debug');
  if (!dbg) return;
  const line = document.createElement('div');
  line.className = 'line ' + (level === 'error' ? 'error' : (level === 'warn' ? 'warn' : 'info'));
  line.textContent = `[${time}] ${msg}`;
  dbg.appendChild(line);
  dbg.scrollTop = dbg.scrollHeight;
}

/* === init === */
ymaps.ready(init);

function init() {
  console.log("Yandex modules loaded:", ymaps.modules);
  console.log("Check multiRouter:", ymaps.multiRouter ? "OK" : "NO multiRouter");

  map = new ymaps.Map('map', { center: [55.76, 37.64], zoom: 5 });
  logDebug('ymaps готов — карта инициализирован');

  // Привязываем обработчики кнопок (делаем не inline, как в GAS)
  document.getElementById('btnSearch').onclick = filterMarkers;
  document.getElementById('btnFilter').onclick = filterMarkers;
  document.getElementById('btnShowAll').onclick = showAllMarkers;
  document.getElementById('routeBtn').onclick = startRoutePlanning;
  document.getElementById('clearRouteBtn').onclick = clearRoute;
  document.getElementById('testSimpleRoute').onclick = testSimpleRoute;
  document.getElementById('btnCalculate').onclick = calculateRoute;
  document.getElementById('btnClosePanel').onclick = closeRoutePanel;

  loadMarkersFromGAS();
}

/* === Load markers via fetch API === */
async function loadMarkersFromGAS() {
  logDebug('Запрос маркеров к GAS: ' + GAS_URL + '?action=markers');
  try {
    const res = await fetch(GAS_URL + '?action=markers');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    createMarkers(data);
    logDebug('Маркировка завершена: добавлено ' + (data.length || 0) + ' элементов');
  } catch (err) {
    logDebug('Ошибка загрузки маркеров: ' + err.message, 'error');
    alert('Не удалось загрузить данные маркеров. Проверьте URL GAS и права доступа.');
  }
}

/* === Markers creation — почти как у тебя === */
function createMarkers(data) {
  if (!Array.isArray(data)) {
    logDebug('createMarkers: ожидался массив, получено: ' + typeof data, 'error');
    return;
  }
  allMarkers = data;
  data.forEach(item => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lng);
    if (isNaN(lat) || isNaN(lng)) {
      logDebug(`Неверные координаты для "${item.name}": lat=${item.lat}, lng=${item.lng}`, 'warn');
      return;
    }
    const placemark = new ymaps.Placemark([lat, lng], {
      balloonContentHeader: item.name,
      balloonContentBody: createBalloonContent(item),
      balloonContentFooter: createBalloonFooter(item)
    }, {
      preset: getPresetByType(item.type),
      balloonCloseButton: true,
      hideIconOnBalloonOpen: false
    });

    placemark.events.add('click', function(e) {
      if (routeMode) {
        addRoutePoint(item);
        e.stopPropagation();
      } else {
        openBalloon(placemark);
      }
    });

    map.geoObjects.add(placemark);
    item.placemark = placemark;
    item.lat = lat; item.lng = lng;
  });
}

/* === Balloons === */
function createBalloonFooter(item) {
  const safeName = (item.name || '').replace(/'/g, "\\'").replace(/"/g, '\\"');
  return `
    <div style="margin-top:10px;">
      <button onclick="(function(){ window._app_addToRoute('${safeName}', ${item.lat}, ${item.lng}); })()" 
              style="background:#4285f4;color:#fff;border:none;padding:5px 10px;border-radius:3px;cursor:pointer;">
        Добавить в маршрут
      </button>
    </div>`;
}
// because our button executed inside balloon context, provide a global helper
window._app_addToRoute = function(name, lat, lng){ addToRoute(name, lat, lng); };

function createBalloonContent(item) {
  return `
    <div class="info-window">
      <div class="info-title">${item.name}</div>
      <div class="info-field"><span class="info-label">Адрес:</span> ${item.address || ''}</div>
      <div class="info-field"><span class="info-label">Производитель:</span> ${item.manufacturer || ''}</div>
      <div class="info-field"><span class="info-label">Продукция:</span> ${item.products || ''}</div>
      <div class="info-field"><span class="info-label">Сайт:</span> ${item.website ? `<a href="${item.website}" target="_blank">${item.website}</a>` : 'не указан'}</div>
      <div class="info-field"><span class="info-label">Тип:</span> ${item.type || ''}</div>
    </div>`;
}

/* === Presets === */
function getPresetByType(type) {
  const presets = {
    'мебельный': 'islands#blueFactoryIcon',
    'металлургия': 'islands#redFactoryIcon',
    'пищевой': 'islands#greenFactoryIcon',
    'машиностроение': 'islands#orangeFactoryIcon'
  };
  return presets[type] || 'islands#blueFactoryIcon';
}

/* === Route management (в точности как в образце, но для внешнего хоста) === */
function startRoutePlanning() {
  routeMode = true;
  document.getElementById('routeBtn').disabled = true;
  document.getElementById('clearRouteBtn').disabled = false;
  document.getElementById('routePanel').style.display = 'block';
  map.container._parentElement.style.cursor = 'pointer';
  alert('Режим построения маршрута включен. Кликайте на предприятия для добавления в маршрут.');
  logDebug('Режим построения маршрута включен');
}

function testSimpleRoute() {
  routePoints = [
    { name: "Тест точка 1", lat: 55.7558, lng: 37.6173 },
    { name: "Тест точка 2", lat: 55.7558, lng: 37.7173 }
  ];
  updateRoutePointsDisplay();
  calculateRoute();
}

function addRoutePoint(enterprise) {
  if (routePoints.length >= 10) { alert('Максимум 10 точек в маршруте'); return; }
  if (routePoints.some(point => point.name === enterprise.name)) { alert('Это предприятие уже добавлено в маршрут'); return; }
  const lat = parseFloat(enterprise.lat);
  const lng = parseFloat(enterprise.lng);
  if (isNaN(lat) || isNaN(lng)) { alert('Ошибка: неверные координаты для предприятия ' + enterprise.name); return; }
  routePoints.push({ name: enterprise.name, lat, lng });
  updateRoutePointsDisplay();
  logDebug(`Добавлена точка "${enterprise.name}" (${lat}, ${lng})`);
}

function addToRoute(name, lat, lng) {
  if (!routeMode) {
    if (confirm('Включить режим построения маршрута и добавить эту точку?')) {
      startRoutePlanning();
      addRoutePoint({ name, lat, lng });
    }
    return;
  }
  addRoutePoint({ name, lat, lng });
}

function updateRoutePointsDisplay() {
  const pointsContainer = document.getElementById('routePoints');
  pointsContainer.innerHTML = '';
  routePoints.forEach((point, index) => {
    const pointElement = document.createElement('div');
    pointElement.className = 'route-point';
    pointElement.innerHTML = `<span>${index + 1}. ${point.name}</span>
      <button class="remove-point" onclick="(function(i){ window._app_removeRoutePoint(i); })(${index})">×</button>`;
    pointsContainer.appendChild(pointElement);
  });
}
window._app_removeRoutePoint = function(i){ removeRoutePoint(i); };

function removeRoutePoint(index) {
  routePoints.splice(index, 1);
  updateRoutePointsDisplay();
}

/* === calculateRoute: построение с таймаутом и логами === */
function calculateRoute() {
  if (routePoints.length < 2) { alert('Добавьте как минимум 2 точки для построения маршрута'); return; }

  try { if (currentRoute) { map.geoObjects.remove(currentRoute); currentRoute = null; logDebug('Предыдущий маршрут удалён'); } } catch (err) { logDebug('Ошибка при удалении предыдущего маршрута: ' + err.message, 'warn'); }

  const routeType = document.getElementById('routeType').value;
  const waypoints = routePoints.map(p => [parseFloat(p.lat), parseFloat(p.lng)]);

  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    if (!Array.isArray(wp) || wp.length !== 2 || isNaN(wp[0]) || isNaN(wp[1])) {
      logDebug('Некорректная точка маршрута на позиции ' + i + ': ' + JSON.stringify(wp), 'error');
      document.getElementById('routeInfo').innerHTML = '<strong>Ошибка:</strong> одна или несколько точек маршрута некорректны';
      return;
    }
  }

  logDebug('Построение маршрута между: ' + JSON.stringify(waypoints));
  document.getElementById('routeInfo').innerHTML = 'Рассчитываем маршрут...';

  // Создаём MultiRoute с правильным ключом routingType
  try {
    const multiRoute = new ymaps.multiRouter.MultiRoute({
      referencePoints: waypoints,
      params: { routingType: routeType }
    }, {
      boundsAutoApply: true,
      wayPointVisible: true,
      routeActiveStrokeWidth: 5,
      routeActiveStrokeColor: "#0054e0"
    });

    map.geoObjects.add(multiRoute);
    currentRoute = multiRoute;

    // Таймаут
    setRouteRequestTimer(multiRoute, 'routingType');

    multiRoute.model.events.add('requestsuccess', function() {
      clearRouteRequestTimer();
      try {
        const routes = multiRoute.getRoutes();
        if (routes && routes.length > 0) {
          const activeRoute = routes.get(0);
          const distance = activeRoute.properties.get("distance");
          const duration = activeRoute.properties.get("duration");
          document.getElementById('routeInfo').innerHTML = `
            <strong>Маршрут построен!</strong><br>
            Расстояние: ${(distance.value / 1000).toFixed(1)} км<br>
            Время: ${Math.round(duration.value / 60)} минут<br>
            Точек в маршруте: ${routePoints.length}
          `;
          map.setBounds(multiRoute.getBounds(), { checkZoomRange: true });
          logDebug('requestsuccess — маршрут построен (routingType)');
        } else {
          document.getElementById('routeInfo').innerHTML = 'Не удалось получить routes из MultiRoute';
          logDebug('requestsuccess, но routes пуст', 'warn');
        }
      } catch (err) {
        logDebug('Ошибка в обработчике requestsuccess: ' + err.message, 'error');
        document.getElementById('routeInfo').innerHTML = 'Маршрут построен, но ошибка при обработке результата';
      }
    });

    multiRoute.model.events.add('requesterror', function(event) {
      clearRouteRequestTimer();
      const error = event && event.get && event.get('error') ? event.get('error') : null;
      const message = error && error.message ? error.message : JSON.stringify(error || event || 'unknown');
      logDebug('requesterror: ' + message, 'error');
      document.getElementById('routeInfo').innerHTML = `<strong>Ошибка построения маршрута:</strong><br>${message}`;
      try { if (currentRoute) { map.geoObjects.remove(currentRoute); currentRoute = null; } } catch(_) {}
    });

    // state change лог
    try {
      multiRoute.model.events.add('requeststatechange', function() {
        try { const st = multiRoute.model.getState(); logDebug('requeststatechange — state: ' + JSON.stringify(st)); } catch(e){}
      });
    } catch(e){}
  } catch (err) {
    logDebug('Ошибка при создании MultiRoute: ' + err.message, 'error');
    document.getElementById('routeInfo').innerHTML = `<strong>Ошибка:</strong> ${err.message}`;
  }
}

function setRouteRequestTimer(multiRoute, usedParamKey) {
  clearRouteRequestTimer();
  routeRequestTimer = setTimeout(() => {
    logDebug(`Таймаут (${ROUTE_TIMEOUT_MS}ms) построения маршрута для ${usedParamKey}`, 'warn');
    try {
      const state = multiRoute && multiRoute.model && multiRoute.model.getState ? multiRoute.model.getState() : null;
      logDebug('model.getState(): ' + JSON.stringify(state), 'warn');
      const allData = multiRoute && multiRoute.model && multiRoute.model.getAllData ? multiRoute.model.getAllData() : null;
      logDebug('model.getAllData(): ' + (allData ? JSON.stringify(allData) : 'null'), 'warn');
    } catch (err) {
      logDebug('Ошибка чтения состояния модели после таймаута: ' + err.message, 'warn');
    }
    document.getElementById('routeInfo').innerHTML = `<strong>Ошибка:</strong> таймаут построения маршрута. Смотрите debug-панель.`;
    try { if (currentRoute) { map.geoObjects.remove(currentRoute); currentRoute = null; } } catch(e){}
  }, ROUTE_TIMEOUT_MS);
}
function clearRouteRequestTimer(){ if(routeRequestTimer){ clearTimeout(routeRequestTimer); routeRequestTimer = null; } }

function clearRoute() {
  routeMode = false;
  routePoints = [];
  document.getElementById('routeBtn').disabled = false;
  document.getElementById('clearRouteBtn').disabled = true;
  document.getElementById('routePanel').style.display = 'none';
  document.getElementById('routePoints').innerHTML = '';
  document.getElementById('routeInfo').innerHTML = '';
  map.container._parentElement.style.cursor = '';
  try { if (currentRoute) { map.geoObjects.remove(currentRoute); currentRoute = null; logDebug('Маршрут очищен'); } } catch(err) { logDebug('Ошибка при очистке маршрута: ' + err.message, 'warn'); }
  clearRouteRequestTimer();
}
function closeRoutePanel(){ document.getElementById('routePanel').style.display = 'none'; }
function filterMarkers() {
  const searchText = document.getElementById('searchInput').value.toLowerCase();
  const typeFilter = document.getElementById('typeFilter').value;
  allMarkers.forEach(item => item.placemark && item.placemark.options.set('visible', true));
  allMarkers.forEach(item => {
    const matchesSearch = !searchText ||
      (item.name && item.name.toLowerCase().includes(searchText)) ||
      (item.products && item.products.toLowerCase().includes(searchText));
    const matchesType = !typeFilter || item.type === typeFilter;
    if (!matchesSearch || !matchesType) item.placemark.options.set('visible', false);
  });
}
function showAllMarkers() { document.getElementById('searchInput').value = ''; document.getElementById('typeFilter').value = ''; allMarkers.forEach(item => item.placemark && item.placemark.options.set('visible', true)); }
function openBalloon(placemark) { placemark.balloon.open(); }
