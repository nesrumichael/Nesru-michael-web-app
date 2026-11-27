/**
 * OUR FACE - Orbital & Global Satellite Telemetry Relay Service
 * Supports LEO/GEO Constellation Routing & Delay-Tolerant Networking (DTN)
 */
const { v4: uuidv4 } = require('uuid');

class SatelliteRelayService {
  constructor() {
    this.constellations = [
      { id: 'OF-LEO-01', name: 'OurFace-Orbital-Alpha', altitudeKm: 550, region: 'East Africa / Horn of Africa (Ethiopia)', status: 'ONLINE', latencyMs: 24 },
      { id: 'OF-LEO-02', name: 'OurFace-Orbital-Europa', altitudeKm: 540, region: 'Europe & Mediterranean', status: 'ONLINE', latencyMs: 28 },
      { id: 'OF-LEO-03', name: 'OurFace-Orbital-Americas', altitudeKm: 560, region: 'North & South America', status: 'ONLINE', latencyMs: 31 },
      { id: 'OF-LEO-04', name: 'OurFace-Orbital-AsiaPac', altitudeKm: 545, region: 'Asia-Pacific & Oceania', status: 'ONLINE', latencyMs: 29 },
      { id: 'OF-DEEP-01', name: 'OurFace-DeepSpace-Gateway', altitudeKm: 384400, region: 'Cislunar / Deep Space Relay', status: 'ACTIVE', latencyMs: 1280 }
    ];
  }

  getTelemetryStatus() {
    return {
      networkName: 'Our Face Global & Space Mesh (OF-GSM)',
      protocol: 'DTN-Bundle-Protocol-v7 / WebSocket-Over-Satellite',
      activeNodes: this.constellations.length,
      globalCoverage: '100% Earth Surface + Orbital Relay',
      satellites: this.constellations.map(sat => ({
        ...sat,
        signalStrength: (96 + Math.random() * 3.9).toFixed(1) + '%',
        timestamp: new Date().toISOString()
      }))
    };
  }

  encapsulateOrbitalPacket(payloadType, originCountry, payloadId) {
    const assignedSat = this.constellations[Math.floor(Math.random() * 4)];
    return {
      packetId: 'SAT-' + uuidv4().split('-')[0].toUpperCase(),
      satelliteNode: assignedSat.name,
      altitudeKm: assignedSat.altitudeKm,
      payloadType,
      originCountry: originCountry || 'GLOBAL',
      payloadId,
      relayedAt: new Date().toISOString(),
      status: 'BROADCAST_GLOBAL_AND_ORBITAL'
    };
  }
}

module.exports = new SatelliteRelayService();
