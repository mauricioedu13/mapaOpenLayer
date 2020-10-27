import 'ol/ol.css';
import GeoJSON from 'ol/format/GeoJSON';
import Map from 'ol/Map';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import View from 'ol/View';
import {Fill, Stroke, Style, Text} from 'ol/style';
import { closestOnSegment } from 'ol/coordinate';
import colormap from 'colormap';

const steps = 30;
const ramp = colormap({
	colormap: 'portland',
	format: 'rgbaString',
	nshades: steps,
	alpha: 0.65
});

let cacheEstilos = {}
let displayKeys = {
	'Date': 'Fecha',
	'TotalConfirmed': 'Total confirmados',
	'TotalDeaths': 'Total de muertes',
	'NewConfirmed': 'Nuevos confirmados',
	'NewDeaths': 'Nuevas muertes',
};

function clamp(value, low, high) {
	return Math.max(low, Math.min(value, high));
}

function getColor(totalConfirmados, min, max) {
	const f = Math.pow(clamp((totalConfirmados - min) / (max - min), 0, 1), 1 / 2);
	const index = Math.round(f * (steps - 1));

	return {
		index,
		color: ramp[index]
	};
}

function getStyle(TotalConfirmed, min, max) {
	const { index, color } = getColor(TotalConfirmed, min, max);

	if ( !cacheEstilos[index] ) {
		cacheEstilos[index] = new Style({
			fill: new Fill({ color }),
			stroke: new Stroke({
				color: 'rgba(255,255,255,0.8)'
			}),
			text: new Text({
				font: '12px Calibri,sans-serif',
				fill: new Fill({
					color: '#000',
				}),
				stroke: new Stroke({
					color: '#f00',
					width: 3,
				}),
			})
		});
	}

	return cacheEstilos[index];
}


function ordenarCasosConfirmados(a, b) {
	if (a.TotalConfirmed > b.TotalConfirmed) {
		return 1;
	}
	if (a.TotalConfirmed < b.TotalConfirmed) {
		return -1;
	}
	return 0;
}

var style = new Style({
	fill: new Fill({
		color: 'rgba(255, 255, 255, 0.6)',
	}),
	stroke: new Stroke({
		color: '#319FD3',
		width: 1,
	}),
	text: new Text({
		font: '12px Calibri,sans-serif',
		fill: new Fill({
			color: '#000',
		}),
		stroke: new Stroke({
			color: '#fff',
			width: 3,
		}),
	}),
});

var vectorLayer = new VectorLayer({
	source: new VectorSource({
		url: 'data/geojson/countries.geojson',
		format: new GeoJSON(),
	}),
	style: function (feature) {
		style.getText().setText(feature.get('ADMIN'));
		return style;
	},
});
var map = new Map({
	layers: [vectorLayer],
	target: 'map',
	view: new View({
		center: [0, 0],
		zoom: 1,
	}),
});

var bandera = false;
vectorLayer.on('change', function() {
	if (bandera || vectorLayer.getSource().getState() != 'ready') { return; }
	bandera = true;

	fetch("https://api.covid19api.com/summary")
		.then(response => response.json())
		.then(json => {
			const ordenados = json.Countries.sort(ordenarCasosConfirmados);
			const min = ordenados[0].TotalConfirmed;
			const max = ordenados[ordenados.length-1].TotalConfirmed;

			vectorLayer.getSource().getFeatures().map(feature => {
				const ISO_2 = feature.get('ISO_A2');
				const filaCovid = json.Countries.find(fila => fila.CountryCode === ISO_2);
				
				if ( filaCovid ) {
					const { TotalConfirmed } = filaCovid;

					feature.setStyle(getStyle(TotalConfirmed, min, max));
					feature.set('datosCovid', filaCovid);
				}
			});
		});

});

var highlightStyle = new Style({
	stroke: new Stroke({
		color: '#f00',
		width: 1,
	}),
	fill: new Fill({
		color: 'rgba(255,0,0,0.1)',
	}),
	text: new Text({
		font: '12px Calibri,sans-serif',
		fill: new Fill({
			color: '#000',
		}),
		stroke: new Stroke({
			color: '#f00',
			width: 3,
		}),
	}),
});

var featureOverlay = new VectorLayer({
	source: new VectorSource(),
	map: map,
	style: function (feature) {
		highlightStyle.getText().setText(feature.get('ADMIN'));
		return highlightStyle;
	},
});

var highlight;
var displayFeatureInfo = function (pixel) {
	vectorLayer.getFeatures(pixel).then(function (features) {
		var feature = features.length ? features[0] : undefined;
		var info = document.getElementById('info');

		if (features.length) {
			const infoCovid = feature.get('datosCovid');
			info.innerHTML = feature.get('ADMIN') + ':<br>';
			Object.keys(displayKeys).map(key => {
				let value = infoCovid[key];

				if ( key === 'Date' ) {
					value = new Date(infoCovid[key]).toLocaleDateString();
				}

				info.innerHTML += displayKeys[key] + ': ' + value + '<br>';
			});
		} else {
			info.innerHTML = '&nbsp;';
		}
		
		if (feature !== highlight) {
			if (highlight) {
				featureOverlay.getSource().removeFeature(highlight);
			}
			if (feature) {
				featureOverlay.getSource().addFeature(feature);
			}
			highlight = feature;
		}
	});
};



map.on('click', function (evt) {
	displayFeatureInfo(evt.pixel);
});
