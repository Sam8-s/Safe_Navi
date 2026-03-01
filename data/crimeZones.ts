//
// crimeZones.ts

export const generateFakeZones = () => {
  const baseLat = 17.421; // JNTUH latitude
  const baseLng = 78.565; // JNTUH longitude
  const riskLevels = ["LOW", "MEDIUM", "HIGH", "VERY_HIGH"];
  const zones = [];

  for (let i = 0; i < 10; i++) {
    const latOffset = (Math.random() - 0.5) * 0.01;
    const lngOffset = (Math.random() - 0.5) * 0.01;
    zones.push({
      id: `zone${i + 1}`,
      risk: riskLevels[Math.floor(Math.random() * riskLevels.length)],
      coordinates: [
        { latitude: baseLat + latOffset, longitude: baseLng + lngOffset },
        {
          latitude: baseLat + latOffset + 0.001,
          longitude: baseLng + lngOffset,
        },
        {
          latitude: baseLat + latOffset + 0.001,
          longitude: baseLng + lngOffset + 0.001,
        },
        {
          latitude: baseLat + latOffset,
          longitude: baseLng + lngOffset + 0.001,
        },
      ],
    });
  }

  return zones;
};

// Generate zones by default
export const crimeZones = generateFakeZones();
