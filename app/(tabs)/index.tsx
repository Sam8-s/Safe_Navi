import * as Location from "expo-location";
import * as Speech from "expo-speech";
import { isPointInPolygon } from "geolib";
import React, { useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, Polygon, Polyline } from "react-native-maps";
import { crimeZones } from "../../data/crimeZones";

type LatLng = {
  latitude: number;
  longitude: number;
};

type CrimeZone = {
  id: string;
  risk: string;
  coordinates: LatLng[];
};

// 🔍 Detect risk at a point
const getRiskAtLocation = (point: LatLng, zones: CrimeZone[]) => {
  for (let zone of zones) {
    if (isPointInPolygon(point, zone.coordinates)) {
      return zone.risk;
    }
  }
  return "LOW";
};

// 🎨 Risk → Color
const riskColor = (risk: string) => {
  switch (risk) {
    case "LOW":
      return "rgba(0,255,0,0.35)";
    case "MEDIUM":
      return "rgba(255,255,0,0.35)";
    case "HIGH":
      return "rgba(255,165,0,0.35)";
    case "VERY_HIGH":
      return "rgba(255,0,0,0.35)";
    default:
      return "rgba(200,200,200,0.2)";
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
  const [zoneRisk, setZoneRisk] = useState<string>("LOW");

  const lastRoutedLocation = useRef<LatLng | null>(null);
  const lastSpokenRisk = useRef<string | null>(null);
  const locationSubscription = useRef<Location.LocationSubscription | null>(
    null,
  );

  // 📍 LIVE LOCATION + RISK DETECTION
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 10,
        },
        (loc) => {
          const current = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };

          setLocation(current);

          // 🚨 Risk detection
          const currentRisk = getRiskAtLocation(current, crimeZones);
          setZoneRisk(currentRisk);

          // 🔊 Speak only when risk changes
          if (currentRisk !== "LOW" && lastSpokenRisk.current !== currentRisk) {
            Speech.speak(`Warning! ${currentRisk} risk area`);
            lastSpokenRisk.current = currentRisk;
          }

          // Reset speech memory when safe
          if (currentRisk === "LOW") {
            lastSpokenRisk.current = null;
          }

          // 🔁 Auto reroute
          if (destination) {
            const prev = lastRoutedLocation.current;
            if (
              !prev ||
              Math.abs(prev.latitude - current.latitude) > 0.0002 ||
              Math.abs(prev.longitude - current.longitude) > 0.0002
            ) {
              lastRoutedLocation.current = current;
              getRoute(current, destination);
            }
          }
        },
      );
    })();

    // 🧹 Cleanup GPS listener
    return () => {
      locationSubscription.current?.remove();
    };
  }, [destination]);

  // 🛣 ROUTE + VOICE
  const getRoute = async (start: LatLng, end: LatLng) => {
    const url = `https://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson&steps=true`;

    const res = await fetch(url);
    const data = await res.json();
    const route = data.routes[0];

    const coords = route.geometry.coordinates.map(
      ([lng, lat]: [number, number]) => ({
        latitude: lat,
        longitude: lng,
      }),
    );

    const step = route.legs[0].steps[0];
    const text = `Turn ${step.maneuver.modifier || "straight"} onto ${
      step.name || "road"
    }`;

    setInstruction(text);
    Speech.speak(text);

    setRouteCoords(coords);
    setDistance((route.distance / 1000).toFixed(2));
    setDuration(Math.ceil(route.duration / 60));
  };

  // 🔍 SEARCH
  const searchPlace = async () => {
    if (!location || !search.trim()) return;

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      search,
    )}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "SafeNavigationApp/1.0",
      },
    });

    const data = await res.json();
    if (!data.length) return alert("Place not found");

    const dest = {
      latitude: parseFloat(data[0].lat),
      longitude: parseFloat(data[0].lon),
    };

    setDestination(dest);
    getRoute(location, dest);
  };

  // 👆 Map tap
  const handleMapPress = (e: any) => {
    if (!location) return;
    setDestination(e.nativeEvent.coordinate);
    getRoute(location, e.nativeEvent.coordinate);
  };

  // 🔁 RESET
  const reset = () => {
    setDestination(null);
    setRouteCoords([]);
    setInstruction(null);
    setDistance(null);
    setDuration(null);
    setSearch("");
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
        style={{ flex: 1 }}
        showsUserLocation
        onPress={handleMapPress}
        region={{
          // latitude: location.latitude,
          // longitude: location.longitude,
          // latitudeDelta: 0.02,
          // longitudeDelta: 0.02,
          latitude: 17.421, // JNTUH
          longitude: 78.565,
          latitudeDelta: 0.01, // smaller delta = closer zoom
          longitudeDelta: 0.01,
        }}
      >
        {crimeZones.map((zone) => (
          <Polygon
            key={zone.id}
            coordinates={zone.coordinates}
            fillColor={riskColor(zone.risk)}
            strokeColor="rgba(0,0,0,0.5)" // make borders visible
            strokeWidth={3}
          />
        ))}

        {destination && <Marker coordinate={destination} />}

        {routeCoords.length > 0 && (
          <Polyline
            coordinates={routeCoords}
            strokeWidth={5}
            strokeColor="blue"
          />
        )}
      </MapView>

      {/* Search */}
      <View style={styles.searchBox}>
        <TextInput
          placeholder="Search place"
          value={search}
          onChangeText={setSearch}
          style={styles.input}
        />
        <TouchableOpacity style={styles.searchBtn} onPress={searchPlace}>
          <Text style={{ color: "white" }}>Search</Text>
        </TouchableOpacity>
      </View>

      {/* Info */}
      {instruction && (
        <View style={styles.infoBox}>
          <Text style={styles.bold}>{instruction}</Text>
          <Text>
            📏 {distance} km • ⏱ {duration} min
          </Text>
        </View>
      )}

      {/* Risk Banner */}
      {zoneRisk !== "LOW" && (
        <View style={styles.warningBox}>
          <Text style={{ fontWeight: "bold" }}>⚠ {zoneRisk} RISK AREA</Text>
        </View>
      )}

      {/* Reset */}
      {destination && (
        <TouchableOpacity style={styles.resetBtn} onPress={reset}>
          <Text style={{ color: "white", fontWeight: "bold" }}>
            Reset Navigation
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// 🎨 Styles
const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBox: {
    position: "absolute",
    top: 70,
    left: 10,
    right: 10,
    flexDirection: "row",
    backgroundColor: "white",
    borderRadius: 10,
    padding: 6,
    elevation: 10,
  },
  input: {
    flex: 1,
    paddingHorizontal: 10,
  },
  searchBtn: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 15,
    justifyContent: "center",
    borderRadius: 8,
  },
  infoBox: {
    position: "absolute",
    top: 110,
    alignSelf: "center",
    backgroundColor: "white",
    padding: 12,
    borderRadius: 10,
    elevation: 5,
  },
  warningBox: {
    position: "absolute",
    top: 160,
    alignSelf: "center",
    backgroundColor: "#fff3cd",
    padding: 10,
    borderRadius: 8,
    elevation: 5,
  },
  bold: {
    fontWeight: "bold",
    textAlign: "center",
  },
  resetBtn: {
    position: "absolute",
    bottom: 30,
    alignSelf: "center",
    backgroundColor: "#E53935",
    padding: 14,
    borderRadius: 25,
  },
});
