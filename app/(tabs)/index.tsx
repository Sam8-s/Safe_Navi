import * as Location from "expo-location";
import * as Speech from "expo-speech";
import { isPointInPolygon } from "geolib";
import React, { useEffect, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, Polygon, Polyline } from "react-native-maps";
import crimeData from "../../data/crimeData.json";
import { crimeZones } from "../../data/crimeZones";
import { generateHeatmapPoints } from "../../data/heatmapData";
import regions from "../../data/indiaRegions.json";
type LatLng = {
  latitude: number;
  longitude: number;
};

type CrimeZone = {
  id: string;
  risk: string;
  coordinates: LatLng[];
};

// 🔍 Detect risk
const getRiskAtLocation = (point: LatLng, zones: CrimeZone[]) => {
  for (let zone of zones) {
    if (isPointInPolygon(point, zone.coordinates)) {
      return zone.risk;
    }
  }
  return "LOW";
};

// 🚨 Route risk detection
const doesRoutePassHighRisk = (coords: LatLng[], zones: CrimeZone[]) => {
  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i];
    const p2 = coords[i + 1];

    for (let t = 0; t <= 1; t += 0.1) {
      const point = {
        latitude: p1.latitude + (p2.latitude - p1.latitude) * t,
        longitude: p1.longitude + (p2.longitude - p1.longitude) * t,
      };

      const risk = getRiskAtLocation(point, zones);
      if (risk === "HIGH" || risk === "VERY_HIGH") return true;
    }
  }
  return false;
};

// 🛣 Waypoints
const getSafeWaypoints = (start: LatLng, end: LatLng): LatLng[] => {
  const midLat = (start.latitude + end.latitude) / 2;
  const midLng = (start.longitude + end.longitude) / 2;

  return [
    { latitude: midLat + 0.05, longitude: midLng },
    { latitude: midLat - 0.05, longitude: midLng },
    { latitude: midLat, longitude: midLng + 0.05 },
    { latitude: midLat, longitude: midLng - 0.05 },

    // diagonals (very important)
    { latitude: midLat + 0.05, longitude: midLng + 0.05 },
    { latitude: midLat - 0.05, longitude: midLng - 0.05 },
  ];
};

// 🎨 Colors
const riskColor = (risk: string) => {
  switch (risk) {
    case "LOW":
      return "rgba(0,200,0,0.25)";
    case "MEDIUM":
      return "rgba(255,255,0,0.25)";
    case "HIGH":
      return "rgba(255,140,0,0.30)";
    case "VERY_HIGH":
      return "rgba(255,0,0,0.35)";
    default:
      return "transparent";
  }
};

export default function HomeScreen() {
  const [location, setLocation] = useState<LatLng | null>(null);
  const [destination, setDestination] = useState<LatLng | null>(null);
  const [routeCoords, setRouteCoords] = useState<LatLng[]>([]);
  const [instruction, setInstruction] = useState<string | null>(null);
  const [distance, setDistance] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [zoneRisk, setZoneRisk] = useState<string>("LOW");
  const [avoidRisk, setAvoidRisk] = useState(true);
  const [autoCenter, setAutoCenter] = useState(true);

  const debounceRef = useRef<any>(null);
  const mapRef = useRef<MapView | null>(null);
  const lastRoutedLocation = useRef<LatLng | null>(null);
  const lastSpokenRisk = useRef<string | null>(null);
  const subRef = useRef<Location.LocationSubscription | null>(null);

  const [heatmapPoints, setHeatmapPoints] = useState<any[]>([]);
  //const [heatmapPoints, setHeatmapPoints] = useState<any[]>([]);
  // 📍 LOCATION TRACKING
  useEffect(() => {
    const pts = generateHeatmapPoints(crimeData);
    console.log("Heatmap points:", pts.length); // debug
    setHeatmapPoints(pts);
  }, []);
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      subRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10 },
        (loc) => {
          const current = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };

          setLocation(current);

          if (autoCenter) {
            mapRef.current?.animateToRegion({
              ...current,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            });
          }

          const risk = getRiskAtLocation(current, crimeZones);
          setZoneRisk(risk);

          if (risk !== "LOW" && lastSpokenRisk.current !== risk) {
            Speech.stop();
            setTimeout(() => {
              Speech.speak(`Warning! ${risk} risk area`);
            }, 300);
            lastSpokenRisk.current = risk;
          }

          if (risk === "LOW") lastSpokenRisk.current = null;

          if (destination) {
            const prev = lastRoutedLocation.current;

            const movedEnough =
              !prev ||
              Math.abs(prev.latitude - current.latitude) > 0.0005 ||
              Math.abs(prev.longitude - current.longitude) > 0.0005;

            if (movedEnough) {
              lastRoutedLocation.current = current;
              getRoute(current, destination, avoidRisk);
            }
          }
        },
      );
    })();

    return () => subRef.current?.remove();
  }, [destination, avoidRisk, autoCenter]);

  // 🛣 ROUTING
  const getRoute = async (start: LatLng, end: LatLng, avoid = true) => {
    try {
      const baseUrl = `https://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson&steps=true`;

      let res = await fetch(baseUrl);
      let data = await res.json();
      if (!data.routes?.length) return;

      let route = data.routes[0];
      let coords = route.geometry.coordinates.map(([lng, lat]: any) => ({
        latitude: lat,
        longitude: lng,
      }));

      let finalRoute = route;

      if (avoid && doesRoutePassHighRisk(coords, crimeZones)) {
        const waypoints = getSafeWaypoints(start, end);

        for (let wp of waypoints) {
          const testUrl = `https://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};${wp.longitude},${wp.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson`;

          const r = await fetch(testUrl);
          const d = await r.json();
          if (!d.routes?.length) continue;

          const testCoords = d.routes[0].geometry.coordinates.map(
            ([lng, lat]: any) => ({
              latitude: lat,
              longitude: lng,
            }),
          );

          if (doesRoutePassHighRisk(testCoords, crimeZones)) {
            console.log("❌ Route still unsafe");
            continue; // skip this route
          }

          // ✅ SAFE ROUTE FOUND
          finalRoute = d.routes[0];
          coords = testCoords;
          Speech.stop();
          Speech.speak("Safer route selected");
          break;
        }
      }

      const step = finalRoute.legs[0]?.steps[0];

      // ⚠ fallback if no safe route found
      if (doesRoutePassHighRisk(coords, crimeZones)) {
        console.log("⚠ No fully safe route found, using least risky route");
      }
      if (step) {
        const text = `Turn ${step.maneuver.modifier || "straight"} onto ${step.name || "road"}`;
        setInstruction(text);
        Speech.stop();
        Speech.speak(text);
      }

      setRouteCoords(coords);
      setDistance((finalRoute.distance / 1000).toFixed(2));
      setDuration(Math.ceil(finalRoute.duration / 60));
    } catch (e) {
      console.log("Routing error:", e);
    }
  };

  // 🔍 SEARCH SUGGESTIONS
  const fetchSuggestions = (text: string) => {
    setSearch(text);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      if (text.length < 3 || !location) return setSuggestions([]);

      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(text)}&limit=5`;

      const res = await fetch(url, {
        headers: { "User-Agent": "SafeNavigationApp/1.0" },
      });

      const data = await res.json();
      setSuggestions(data);
    }, 400);
  };

  const selectSuggestion = (item: any) => {
    const dest = {
      latitude: parseFloat(item.lat),
      longitude: parseFloat(item.lon),
    };

    setDestination(dest);
    setSearch(item.display_name);
    setSuggestions([]);
    if (!location) return;
    getRoute(location, dest, avoidRisk);
  };

  const reset = () => {
    setDestination(null);
    setRouteCoords([]);
    setInstruction(null);
    setDistance(null);
    setDuration(null);
    setSearch("");
    setSuggestions([]);
    setZoneRisk("LOW");
    lastSpokenRisk.current = null;
    Speech.stop();
  };

  if (!location) {
    return (
      <View style={styles.center}>
        <Text>📡 Getting live location...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        showsUserLocation
        onPress={(e) => {
          const dest = e.nativeEvent.coordinate;
          setDestination(dest);
          getRoute(location, dest, avoidRisk);
        }}
        initialRegion={{
          ...location,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
      >
        {/* {heatmapPoints.length > 0 && (
          <Heatmap points={heatmapPoints} radius={50} opacity={0.7} />
        )} */}
        {/* 🔴 DEBUG: show crime zones */}
        {crimeZones.map((zone, i) => (
          <Polygon
            key={`zone-${i}`}
            coordinates={zone.coordinates}
            fillColor="rgba(255,0,0,0.2)"
            strokeColor="rgba(255,0,0,0.5)"
          />
        ))}
        {regions.features.map((feature: any, index: number) => {
          const coords = (() => {
            const geom = feature.geometry;
            if (!geom || !geom.coordinates) return [];

            try {
              if (geom.type === "Polygon") {
                return geom.coordinates[0].map(([lng, lat]: number[]) => ({
                  latitude: lat,
                  longitude: lng,
                }));
              }

              if (geom.type === "MultiPolygon") {
                return (
                  geom.coordinates[0]?.[0]?.map(([lng, lat]: number[]) => ({
                    latitude: lat,
                    longitude: lng,
                  })) || []
                );
              }
            } catch (e) {
              console.log("Polygon parse error:", e);
            }

            return [];
          })();
          // match with your crime data
          const cityName = feature.properties.name;

          const cityData = crimeData.find((c) => {
            const city = c.City.toLowerCase().trim();
            const region = cityName.toLowerCase().trim();

            return region.includes(city);
          });

          let risk: string | null = null;

          if (cityData) {
            switch (cityData["Safety Zone"]) {
              case "Red":
                risk = "VERY_HIGH";
                break;
              case "Orange":
                risk = "HIGH";
                break;
              case "Yellow":
                risk = "MEDIUM";
                break;
              default:
                risk = "LOW";
            }
          }
          if (!risk) return null;
          if (!coords.length) return null;
          console.log(
            "Region:",
            cityName,
            "| Risk:",
            risk,
            "| Points:",
            coords.length,
          );

          return (
            <Polygon
              key={index}
              coordinates={coords}
              fillColor={riskColor(risk)}
              strokeColor="rgba(0,0,0,0.2)"
            />
          );
        })}

        {destination && <Marker coordinate={destination} />}

        {routeCoords.length > 0 && (
          <Polyline
            coordinates={routeCoords}
            strokeWidth={5}
            strokeColor="blue"
          />
        )}
      </MapView>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <ScrollView style={styles.suggestionBox}>
          {suggestions.map((item, i) => (
            <TouchableOpacity key={i} onPress={() => selectSuggestion(item)}>
              <Text style={styles.suggestionItem}>
                {item.display_name.split(",")[0]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Search */}
      <View style={styles.searchBox}>
        <TextInput
          placeholder="Search place"
          value={search}
          onChangeText={fetchSuggestions}
          style={styles.input}
        />
        <TouchableOpacity style={styles.searchBtn}>
          <Text style={{ color: "white" }}>Search</Text>
        </TouchableOpacity>
      </View>

      {/* Controls */}
      <TouchableOpacity
        style={styles.toggleBtn}
        onPress={() => setAvoidRisk(!avoidRisk)}
      >
        <Text style={{ color: "white" }}>
          {avoidRisk ? "Avoiding Risk ✅" : "Avoid Risk ❌"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.autoBtn}
        onPress={() => setAutoCenter(!autoCenter)}
      >
        <Text style={{ color: "white" }}>
          {autoCenter ? "Auto Center ON" : "Auto Center OFF"}
        </Text>
      </TouchableOpacity>

      {/* Info */}
      {instruction && (
        <View style={styles.infoBox}>
          <Text style={styles.bold}>{instruction}</Text>
          <Text>
            📏 {distance} km • ⏱ {duration} min
          </Text>
        </View>
      )}

      {/* Risk */}
      {zoneRisk !== "LOW" && (
        <View style={styles.warningBox}>
          <Text style={{ fontWeight: "bold" }}>⚠ {zoneRisk} RISK AREA</Text>
        </View>
      )}

      {/* Reset */}
      {destination && (
        <TouchableOpacity style={styles.resetBtn} onPress={reset}>
          <Text style={{ color: "white" }}>Reset</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  searchBox: {
    position: "absolute",
    top: 20,
    left: 10,
    right: 10,
    flexDirection: "row",
    backgroundColor: "white",
    padding: 6,
    borderRadius: 10,
    elevation: 10,
  },

  suggestionBox: {
    position: "absolute",
    top: 70,
    left: 10,
    right: 10,
    backgroundColor: "white",
    borderRadius: 10,
    elevation: 10,
    maxHeight: 200,
  },

  suggestionItem: {
    padding: 10,
    borderBottomWidth: 0.5,
  },

  input: { flex: 1, paddingHorizontal: 10 },

  searchBtn: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 15,
    justifyContent: "center",
    borderRadius: 8,
  },

  toggleBtn: {
    position: "absolute",
    top: 80,
    right: 10,
    backgroundColor: "#333",
    padding: 10,
    borderRadius: 10,
  },

  autoBtn: {
    position: "absolute",
    top: 130,
    right: 10,
    backgroundColor: "#555",
    padding: 10,
    borderRadius: 10,
  },

  infoBox: {
    position: "absolute",
    top: 110,
    alignSelf: "center",
    backgroundColor: "white",
    padding: 12,
    borderRadius: 10,
  },

  warningBox: {
    position: "absolute",
    top: 160,
    alignSelf: "center",
    backgroundColor: "#fff3cd",
    padding: 10,
    borderRadius: 8,
  },

  bold: { fontWeight: "bold", textAlign: "center" },

  resetBtn: {
    position: "absolute",
    bottom: 30,
    alignSelf: "center",
    backgroundColor: "#E53935",
    padding: 14,
    borderRadius: 25,
  },
});
