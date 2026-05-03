export const cityCoords: Record<
  string,
  { latitude: number; longitude: number }
> = {
  Agra: { latitude: 27.1752554, longitude: 78.0098161 },
  Ahmedabad: { latitude: 23.0215374, longitude: 72.5800568 },
  Bangalore: { latitude: 12.9767936, longitude: 77.590082 },
  Bhopal: { latitude: 23.2584857, longitude: 77.401989 },
  Chennai: { latitude: 13.0836939, longitude: 80.270186 },
  Delhi: { latitude: 28.6138954, longitude: 77.2090057 },
  Faridabad: { latitude: 28.4031478, longitude: 77.3105561 },
  Ghaziabad: { latitude: 28.7749966, longitude: 77.4586967 },
  Hyderabad: { latitude: 17.360589, longitude: 78.4740613 },
  Indore: { latitude: 22.7203616, longitude: 75.8681996 },
  Jaipur: { latitude: 26.9154576, longitude: 75.8189817 },
  Kalyan: { latitude: 19.2396742, longitude: 73.1366482 },
  Kanpur: { latitude: 26.4609135, longitude: 80.3217588 },
  Kolkata: { latitude: 22.5726459, longitude: 88.3638953 },
  Lucknow: { latitude: 26.8381, longitude: 80.9346001 },
  Ludhiana: { latitude: 30.9090157, longitude: 75.851601 },
  Meerut: { latitude: 29.0018557, longitude: 77.7679671 },
  Mumbai: { latitude: 19.054999, longitude: 72.8692035 },
  Nagpur: { latitude: 21.1498134, longitude: 79.0820556 },
  Nashik: { latitude: 20.0112475, longitude: 73.7902364 },
};
const getWeight = (zone: string) => {
  switch (zone) {
    case "Red":
      return 10;
    case "Orange":
      return 7;
    case "Yellow":
      return 4;
    case "Green":
      return 1;
    default:
      return 1;
  }
};
//export const generateHeatmapPoints = async (data: any[]) => {
export const generateHeatmapPoints = (data: any[]) => {
  let points: any[] = [];

  // for (let city of data) {
  // const coords = await getCityCoordinates(city.City);
  data.forEach((city) => {
    const coords = cityCoords[city.City];

    if (!coords) return;

    const weight = getWeight(city["Safety Zone"]);

    for (let i = 0; i < 25; i++) {
      points.push({
        latitude: coords.latitude + (Math.random() - 0.5) * 0.05,
        longitude: coords.longitude + (Math.random() - 0.5) * 0.05,
        weight: weight,
      });
    }
  });

  return points;
};

// let cityCache: Record<string, { latitude: number; longitude: number }> = {};
// const getCityCoordinates = async (city: string) => {
//   // ✅ if already cached → use it
//   if (cityCache[city]) return cityCache[city];

//   try {
//     const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city)}`;

//     const res = await fetch(url, {
//       headers: { "User-Agent": "SafeNavigationApp/1.0" },
//     });

//     const data = await res.json();

//     if (!data.length) return null;

//     const coords = {
//       latitude: parseFloat(data[0].lat),
//       longitude: parseFloat(data[0].lon),
//     };

//     // ✅ save to cache
//     cityCache[city] = coords;

//     return coords;
//   } catch {
//     return null;
//   }
// };
