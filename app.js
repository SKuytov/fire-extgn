// Fire Safety Station Manager - Complete Station-Based System
class FireSafetyStationApp {
    constructor() {
        this.map = null;
        this.markersLayer = null;
        this.stations = [];
        this.buildings = [];
        this.selectedStation = null;
        this.searchTimeout = null;
        this.blinkingMarker = null;
        
        // Map configuration
        this.MAP_WIDTH = 7972;
        this.MAP_HEIGHT = 5905;

        // Real-time status thresholds (days)
        this.STATUS_THRESHOLDS = {
            WARNING_PERIOD: 15,
            OVERDUE_THRESHOLD: 30
        };

        // Status colors and priority order
        this.statusColors = {
            good: '#4CAF50',
            inspection_due_soon: '#FF9800',
            overdue: '#F44336',
            maintenance_required: '#FF5722'
        };
        
        this.statusPriority = ['maintenance_required', 'overdue', 'inspection_due_soon', 'good'];
        
        this.init();
    }
    
    async init() {
        try {
            console.log('Initializing Fire Safety Station Manager...');
            await this.loadData();
            this.initMap();
            this.setupEventListeners();
            this.setupRealTimeStatusUpdates();
            this.updateStats();
            this.populateBuildings();
            console.log('Fire Safety Station Manager initialized successfully');
        } catch (error) {
            console.error('Failed to initialize application:', error);
            this.showError('Failed to load application data');
        }
    }

    // Real-time status calculation for individual assets
    calculateRealTimeStatus(asset) {
        if (!asset.nextDue) {
            return 'maintenance_required';
        }

        const today = new Date();
        const dueDate = new Date(asset.nextDue);
        const timeDiff = dueDate.getTime() - today.getTime();
        const daysUntilDue = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

        if (daysUntilDue > this.STATUS_THRESHOLDS.WARNING_PERIOD) {
            return 'good';
        } else if (daysUntilDue > 0) {
            return 'inspection_due_soon';
        } else if (daysUntilDue >= -this.STATUS_THRESHOLDS.OVERDUE_THRESHOLD) {
            return 'overdue';
        } else {
            return 'maintenance_required';
        }
    }

    // Calculate station status as worst asset status
    getStationStatus(station) {
        if (!station.assets || station.assets.length === 0) {
            return 'maintenance_required';
        }
        
        return station.assets.reduce((worstStatus, asset) => {
            const assetStatus = this.calculateRealTimeStatus(asset);
            const currentPriority = this.statusPriority.indexOf(worstStatus);
            const assetPriority = this.statusPriority.indexOf(assetStatus);
            return assetPriority < currentPriority ? assetStatus : worstStatus;
        }, 'good');
    }

    // Get detailed status information for assets
    getStatusDetails(asset) {
        const today = new Date();
        const dueDate = new Date(asset.nextDue);
        const timeDiff = dueDate.getTime() - today.getTime();
        const daysUntilDue = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
        
        const status = this.calculateRealTimeStatus(asset);
        
        const statusDetails = {
            good: {
                label: 'Good',
                description: `Inspection due in ${daysUntilDue} days`,
                icon: '✅ ',
                priority: 'low'
            },
            inspection_due_soon: {
                label: 'Inspection Due Soon',
                description: `Inspection due in ${daysUntilDue} days`,
                icon: '⏰',
                priority: 'medium'
            },
            overdue: {
                label: 'Overdue',
                description: `Inspection overdue by ${Math.abs(daysUntilDue)} days`,
                icon: '⚠️',
                priority: 'high'
            },
            maintenance_required: {
                label: 'Maintenance Required',
                description: `Critical: ${Math.abs(daysUntilDue)} days overdue`,
                icon: '🔧',
                priority: 'critical'
            }
        };

        return statusDetails[status];
    }

    // Setup automatic status refresh
    setupRealTimeStatusUpdates() {
        this.refreshAllStatuses();
        
        this.statusRefreshInterval = setInterval(() => {
            this.refreshAllStatuses();
            console.log('Station statuses automatically refreshed');
        }, 3600000);
        
        this.setupMidnightRefresh();
        console.log('Real-time status updates enabled');
    }

    setupMidnightRefresh() {
        const now = new Date();
        const midnight = new Date();
        midnight.setHours(24, 0, 0, 0);
        
        const msUntilMidnight = midnight.getTime() - now.getTime();
        
        setTimeout(() => {
            this.refreshAllStatuses();
            setInterval(() => {
                this.refreshAllStatuses();
            }, 24 * 60 * 60 * 1000);
        }, msUntilMidnight);
    }

    // Refresh all station and asset statuses
    refreshAllStatuses() {
        let statusChanges = 0;
        
        this.stations.forEach(station => {
            station.assets.forEach(asset => {
                const oldStatus = asset.status;
                const newStatus = this.calculateRealTimeStatus(asset);
                
                if (oldStatus !== newStatus) {
                    console.log(`Status changed for ${asset.assetId}: ${oldStatus} → ${newStatus}`);
                    asset.status = newStatus;
                    statusChanges++;
                }
            });
            
            // Update station status
            const oldStationStatus = station.status;
            const newStationStatus = this.getStationStatus(station);
            if (oldStationStatus !== newStationStatus) {
                station.status = newStationStatus;
                statusChanges++;
            }
        });
        
        if (statusChanges > 0) {
            this.updateMarkerColors();
            this.updateStats();
            this.populateBuildings();
        }
    }

    // Update marker colors on the map
    updateMarkerColors() {
        this.markersLayer.eachLayer(layer => {
            if (layer.station) {
                const station = layer.station;
                const newStatus = this.getStationStatus(station);
                station.status = newStatus;
                
                const markerElement = layer.getElement();
                if (markerElement) {
                    const markerDiv = markerElement.querySelector('.station-marker');
                    if (markerDiv) {
                        const newColor = this.statusColors[newStatus];
                        const textColor = this.getContrastColor(newColor);
                        
                        markerDiv.style.backgroundColor = newColor;
                        markerDiv.style.color = textColor;
                        markerDiv.className = `station-marker marker-${newStatus}`;
                    }
                }
            }
        });
    }

    async loadData() {
        console.log('Loading station data...');
        
        try {
            const data = await this.loadFromJSON();
            this.processLoadedData(data);
            console.log('Successfully loaded data from JSON file');
            return;
        } catch (jsonError) {
            console.warn('JSON loading failed:', jsonError.message);
            
            try {
                const data = await this.loadFromCSV();
                this.processLoadedData(data);
                console.log('Successfully loaded data from CSV backup');
                return;
            } catch (csvError) {
                console.error('Both JSON and CSV loading failed:', csvError.message);
                console.log('No external data files available - starting with empty dataset');
                this.buildings = [];
                this.stations = [];
            }
        }
    }

    async loadFromJSON() {
        const response = await fetch('stations.json');
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return await response.json();
    }

    async loadFromCSV() {
        if (typeof Papa === 'undefined') {
            throw new Error('Papa Parse library not loaded');
        }
        
        const response = await fetch('stations.csv');
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const csvText = await response.text();
        
        return new Promise((resolve, reject) => {
            Papa.parse(csvText, {
                header: true,
                dynamicTyping: true,
                skipEmptyLines: true,
                complete: (results) => {
                    if (results.errors.length > 0) {
                        reject(new Error(`CSV parsing errors: ${results.errors.map(e => e.message).join(', ')}`));
                    } else {
                        resolve(this.convertCSVToJSON(results.data));
                    }
                },
                error: (error) => {
                    reject(new Error(`CSV parsing failed: ${error.message}`));
                }
            });
        });
    }

    convertCSVToJSON(csvData) {
        const stationMap = new Map();
        
        // Group rows by stationId
        csvData.forEach(row => {
            const stationId = row.stationId || row.StationID;
            if (!stationId) return;
            
            if (!stationMap.has(stationId)) {
                stationMap.set(stationId, {
                    stationId: stationId,
                    building: parseInt(row.building) || parseInt(row.Building),
                    x: parseFloat(row.x) || parseFloat(row.X),
                    y: parseFloat(row.y) || parseFloat(row.Y),
                    assets: []
                });
            }
            
            const station = stationMap.get(stationId);
            const asset = {
                assetId: row.assetId || row.AssetID,
                assetType: row.assetType || row.AssetType || 'extinguisher',
                type: row.type || row.Type,
                size: row.size || row.Size,
                manufacturer: row.manufacturer || row.Manufacturer,
                lastInspection: this.parseDate(row.lastInspection || row['Last Inspection']),
                nextDue: this.parseDate(row.nextDue || row['Next Due']),
                isoCategory: row.isoCategory || row['ISO Category'] || this.determineISOCategory(row.type),
                inspectionStickerID: row.inspectionStickerID || row['Inspection Sticker ID'] || 'STK-NOT-ASSIGNED',
                status: row.status || row.Status || 'unknown'
            };
            
            // Handle hoses differently
            if (asset.assetType === 'hose') {
                asset.length = asset.size;
                asset.diameter = '25mm'; // Default diameter
                delete asset.isoCategory;
            }
            
            station.assets.push(asset);
        });
        
        // Create buildings data
        const buildingMap = new Map();
        Array.from(stationMap.values()).forEach(station => {
            if (!buildingMap.has(station.building)) {
                buildingMap.set(station.building, []);
            }
            buildingMap.get(station.building).push(station);
        });
        
        const buildingColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', '#FF9FF3'];
        const buildings = Array.from(buildingMap.entries()).map(([id, stations], index) => ({
            id,
            name: `Building-${id}`,
            stations: stations.length,
            totalAssets: stations.reduce((sum, s) => sum + s.assets.length, 0),
            color: buildingColors[index % buildingColors.length]
        }));
        
        return {
            buildings,
            stations: Array.from(stationMap.values())
        };
    }

    // Parse date with flexible format support
    parseDate(dateString) {
        if (!dateString) return null;
        
        const formats = [
            /(\d{1,2})\/(\d{1,2})\/(\d{4})/,  // MM/DD/YYYY
            /(\d{4})-(\d{1,2})-(\d{1,2})/,   // YYYY-MM-DD
            /(\d{1,2})\.(\d{1,2})\.(\d{4})/  // DD.MM.YYYY
        ];
        
        for (let format of formats) {
            const match = dateString.match(format);
            if (match) {
                const year = match[3] || match[1];
                const month = match[1] === year ? match[2] : match[1];
                const day = match[1] === year ? match[3] : match[2];
                
                const date = new Date(year, month - 1, day);
                return date.toISOString().split('T')[0];
            }
        }
        
        return dateString;
    }

    determineISOCategory(type) {
        if (!type) return 1;
        
        const typeUpper = type.toString().toUpperCase();
        
        if (typeUpper === 'CO2' || typeUpper.startsWith('CO')) {
            return 5;
        } else if (typeUpper === 'FOAM') {
            return 1;
        } else if (typeUpper === 'POWDER') {
            return 2;
        } else if (typeUpper === 'WATER') {
            return 1;
        } else {
            return 1;
        }
    }

    processLoadedData(data) {
        this.buildings = data.buildings || [];
        
        this.stations = (data.stations || []).map(station => {
            const building = this.buildings.find(b => b.id === station.building);
            
            // Calculate real-time status for all assets
            station.assets.forEach(asset => {
                asset.originalStatus = asset.status;
                asset.status = this.calculateRealTimeStatus(asset);
            });
            
            return {
                ...station,
                buildingName: building ? building.name : 'Unknown Building',
                buildingColor: building ? building.color : '#999999',
                status: this.getStationStatus(station)
            };
        });
        
        console.log(`Loaded ${this.stations.length} stations with ${this.getTotalAssets()} total assets`);
    }

    getTotalAssets() {
        return this.stations.reduce((total, station) => total + station.assets.length, 0);
    }

    initMap() {
        console.log('Initializing map...');
        
        this.map = L.map('map', {
            crs: L.CRS.Simple,
            minZoom: -3,
            maxZoom: 3,
            zoomControl: true,
            attributionControl: false,
            preferCanvas: true
        });
        
        const imageBounds = [[0, 0], [this.MAP_HEIGHT, this.MAP_WIDTH]];
        L.imageOverlay('map-layout.jpg', imageBounds).addTo(this.map);
        this.map.fitBounds(imageBounds);
        
        this.markersLayer = L.layerGroup().addTo(this.map);
        this.addMarkers();
        
        setTimeout(() => {
            this.fitToMarkers();
        }, 100);
        
        console.log('Map initialized successfully');
    }

    addMarkers() {
        console.log(`Adding ${this.stations.length} station markers...`);
        
        this.stations.forEach(station => {
            const marker = this.createMarker(station);
            this.markersLayer.addLayer(marker);
        });
        
        console.log('Station markers added successfully');
    }

    createMarker(station) {
        const latLng = [this.MAP_HEIGHT - station.y, station.x];
        
        const markerSize = 28;
        const stationStatus = this.getStationStatus(station);
        const color = this.statusColors[stationStatus] || '#999999';
        const textColor = this.getContrastColor(color);
        const label = station.stationId.replace('ST-', '').replace('-', '');
        
        const markerHtml = `
            <div class="station-marker marker-${stationStatus}" 
                 style="width: ${markerSize}px; height: ${markerSize}px; background-color: ${color}; color: ${textColor}; 
                        border-radius: 50%; display: flex; align-items: center; justify-content: center; 
                        font-weight: bold; font-size: 11px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
                ${label}
            </div>
        `;
        
        const marker = L.marker(latLng, {
            icon: L.divIcon({
                html: markerHtml,
                className: 'custom-marker',
                iconSize: [markerSize, markerSize],
                iconAnchor: [markerSize / 2, markerSize / 2]
            })
        });
        
        const popupContent = this.createPopupContent(station);
        marker.bindPopup(popupContent, {
            maxWidth: 450,
            className: 'custom-popup'
        });
        
        marker.on('click', (e) => {
            this.selectedStation = station;
            marker.openPopup();
        });
        
        marker.station = station;
        return marker;
    }
    
    getContrastColor(hexColor) {
        const hex = hexColor.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.5 ? '#000000' : '#FFFFFF';
    }

    createPopupContent(station) {
        const extinguishers = station.assets.filter(a => a.assetType === 'extinguisher');
        const hoses = station.assets.filter(a => a.assetType === 'hose');
        
        let content = `
            <div style="min-width: 400px; font-family: Arial, sans-serif;">
                <h3 style="margin: 0 0 12px 0; color: var(--color-text);">${station.stationId}</h3>
                <p style="margin: 0 0 8px 0;"><strong>Building:</strong> ${station.buildingName}</p>
                <p style="margin: 0 0 16px 0;"><strong>Location:</strong> ${station.x}, ${station.y}</p>
        `;
        
        if (extinguishers.length > 0) {
            content += `
                <h4 style="margin: 16px 0 8px 0; color: var(--color-text);">Fire Extinguishers (${extinguishers.length})</h4>
                <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                    <thead>
                        <tr style="background: rgba(0,0,0,0.1);">
                            <th style="padding: 4px; text-align: left; border: 1px solid #ddd;">ID</th>
                            <th style="padding: 4px; text-align: left; border: 1px solid #ddd;">Type</th>
                            <th style="padding: 4px; text-align: left; border: 1px solid #ddd;">Size</th>
                            <th style="padding: 4px; text-align: left; border: 1px solid #ddd;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            
            extinguishers.forEach(ext => {
                const statusColor = this.statusColors[ext.status];
                const statusDetails = this.getStatusDetails(ext);
                content += `
                    <tr>
                        <td style="padding: 4px; border: 1px solid #ddd; font-size: 10px;">${ext.assetId}</td>
                        <td style="padding: 4px; border: 1px solid #ddd; font-size: 10px;">${ext.type}</td>
                        <td style="padding: 4px; border: 1px solid #ddd; font-size: 10px;">${ext.size}</td>
                        <td style="padding: 4px; border: 1px solid #ddd; font-size: 10px; color: ${statusColor};">
                            ${statusDetails.icon}
                        </td>
                    </tr>
                `;
            });
            
            content += `
                    </tbody>
                </table>
            `;
        }
        
        if (hoses.length > 0) {
            content += `
                <h4 style="margin: 16px 0 8px 0; color: var(--color-text);">Fire Hoses (${hoses.length})</h4>
                <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                    <thead>
                        <tr style="background: rgba(0,0,0,0.1);">
                            <th style="padding: 4px; text-align: left; border: 1px solid #ddd;">ID</th>
                            <th style="padding: 4px; text-align: left; border: 1px solid #ddd;">Length</th>
                            <th style="padding: 4px; text-align: left; border: 1px solid #ddd;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            
            hoses.forEach(hose => {
                const statusColor = this.statusColors[hose.status];
                const statusDetails = this.getStatusDetails(hose);
                content += `
                    <tr>
                        <td style="padding: 4px; border: 1px solid #ddd; font-size: 10px;">${hose.assetId}</td>
                        <td style="padding: 4px; border: 1px solid #ddd; font-size: 10px;">${hose.length}</td>
                        <td style="padding: 4px; border: 1px solid #ddd; font-size: 10px; color: ${statusColor};">
                            ${statusDetails.icon}
                        </td>
                    </tr>
                `;
            });
            
            content += `
                    </tbody>
                </table>
            `;
        }
        
        content += `
                <button onclick="window.app.showStationDetails('${station.stationId}')" 
                        style="background: #007cba; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-top: 12px; width: 100%;">
                    View Full Details
                </button>
            </div>
        `;
        
        return content;
    }

    setupEventListeners() {
        console.log('Setting up event listeners...');
        
        const searchInput = document.getElementById('searchInput');
        const clearSearch = document.getElementById('clearSearch');
        const searchSuggestions = document.getElementById('searchSuggestions');
        
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => {
                    this.handleSearch(e.target.value);
                }, 200);
            });
        }
        
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container')) {
                if (searchSuggestions) {
                    searchSuggestions.classList.remove('visible');
                }
            }
        });
        
        if (clearSearch) {
            clearSearch.addEventListener('click', () => {
                this.clearSearch();
            });
        }
        
        // FAB buttons
        const dashboardBtn = document.getElementById('dashboardBtn');
        const buildingsBtn = document.getElementById('buildingsBtn');
        const infoBtn = document.getElementById('infoBtn');
        const homeBtn = document.getElementById('homeBtn');
        
        if (dashboardBtn) {
            dashboardBtn.addEventListener('click', () => {
                this.showModal('dashboardModal');
            });
        }
        
        if (buildingsBtn) {
            buildingsBtn.addEventListener('click', () => {
                this.showModal('buildingsModal');
            });
        }
        
        if (infoBtn) {
            infoBtn.addEventListener('click', () => {
                if (this.selectedStation) {
                    this.showStationInfo(this.selectedStation);
                } else {
                    this.showModal('infoModal');
                }
            });
        }
        
        if (homeBtn) {
            homeBtn.addEventListener('click', () => {
                this.clearSearch();
                this.fitToMarkers();
            });
        }
        
        // Modal close buttons
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modalId = e.target.getAttribute('data-modal');
                this.hideModal(modalId);
            });
        });
        
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideModal(modal.id);
                }
            });
        });
        
        // Export buttons
        const exportCSV = document.getElementById('exportCSV');
        const exportJSON = document.getElementById('exportJSON');
        
        if (exportCSV) {
            exportCSV.addEventListener('click', () => {
                this.exportData('csv');
            });
        }
        
        if (exportJSON) {
            exportJSON.addEventListener('click', () => {
                this.exportData('json');
            });
        }
        
        console.log('Event listeners set up successfully');
    }

    handleSearch(query) {
        const searchSuggestions = document.getElementById('searchSuggestions');
        
        if (!query.trim()) {
            if (searchSuggestions) {
                searchSuggestions.classList.remove('visible');
            }
            return;
        }
        
        // Search both stations and individual assets
        const matches = [];
        
        this.stations.forEach(station => {
            // Match station ID
            if (station.stationId.toLowerCase().includes(query.toLowerCase())) {
                matches.push({
                    type: 'station',
                    station: station,
                    display: `${station.stationId} - ${station.buildingName}`,
                    subtitle: `Station with ${station.assets.length} assets`
                });
            }
            
            // Match individual assets
            station.assets.forEach(asset => {
                if (asset.assetId.toLowerCase().includes(query.toLowerCase()) ||
                    asset.type.toLowerCase().includes(query.toLowerCase()) ||
                    asset.manufacturer.toLowerCase().includes(query.toLowerCase())) {
                    matches.push({
                        type: 'asset',
                        station: station,
                        asset: asset,
                        display: `${asset.assetId} - ${station.stationId}`,
                        subtitle: `${asset.assetType}: ${asset.type} ${asset.size}`
                    });
                }
            });
        });
        
        if (!searchSuggestions) return;
        
        if (matches.length === 0) {
            searchSuggestions.innerHTML = '<div class="suggestion-item">No results found</div>';
            searchSuggestions.classList.add('visible');
            return;
        }
        
        searchSuggestions.innerHTML = matches.slice(0, 10).map(match => `
            <div class="suggestion-item" data-station-id="${match.station.stationId}" tabindex="0">
                <strong>${match.display}</strong>
                <br><small style="color: #666;">${match.subtitle}</small>
            </div>
        `).join('');
        
        searchSuggestions.classList.add('visible');
        
        searchSuggestions.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
                const stationId = item.getAttribute('data-station-id');
                if (stationId) {
                    this.selectStation(stationId);
                }
            });
        });
    }

    selectStation(stationId) {
        const station = this.findStation(stationId);
        if (!station) return;
        
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.value = station.stationId;
        }
        
        const searchSuggestions = document.getElementById('searchSuggestions');
        if (searchSuggestions) {
            searchSuggestions.classList.remove('visible');
        }
        
        this.clearBlinkingMarker();
        
        this.markersLayer.eachLayer(layer => {
            if (layer.station && layer.station.stationId === stationId) {
                const markerElement = layer.getElement();
                if (markerElement) {
                    const markerDiv = markerElement.querySelector('.station-marker');
                    if (markerDiv) {
                        markerDiv.classList.add('marker-blinking');
                        this.blinkingMarker = markerDiv;
                    }
                }
                
                const latLng = [this.MAP_HEIGHT - station.y, station.x];
                this.map.setView(latLng, 1);
            }
        });
        
        this.selectedStation = station;
    }

    clearSearch() {
        const searchInput = document.getElementById('searchInput');
        const searchSuggestions = document.getElementById('searchSuggestions');
        
        if (searchInput) {
            searchInput.value = '';
        }
        if (searchSuggestions) {
            searchSuggestions.classList.remove('visible');
        }
        this.clearBlinkingMarker();
    }

    clearBlinkingMarker() {
        if (this.blinkingMarker) {
            this.blinkingMarker.classList.remove('marker-blinking');
            this.blinkingMarker = null;
        }
    }

    findStation(stationId) {
        return this.stations.find(station => station.stationId === stationId);
    }

    fitToMarkers() {
        if (this.markersLayer.getLayers().length === 0) {
            const imageBounds = [[0, 0], [this.MAP_HEIGHT, this.MAP_WIDTH]];
            this.map.fitBounds(imageBounds);
            return;
        }
        
        const group = new L.featureGroup(this.markersLayer.getLayers());
        this.map.fitBounds(group.getBounds().pad(0.1));
    }

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('visible');
        }
    }

    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('visible');
        }
    }

    updateStats() {
        const stats = {
            totalStations: this.stations.length,
            totalAssets: this.getTotalAssets(),
            good: 0,
            inspection_due_soon: 0,
            overdue: 0,
            maintenance_required: 0
        };
        
        this.stations.forEach(station => {
            station.assets.forEach(asset => {
                asset.status = this.calculateRealTimeStatus(asset);
                stats[asset.status] = (stats[asset.status] || 0) + 1;
            });
        });
        
        const totalCount = document.getElementById('totalCount');
        const goodCount = document.getElementById('goodCount');
        const dueSoonCount = document.getElementById('dueSoonCount');
        const overdueCount = document.getElementById('overdueCount');
        const maintenanceCount = document.getElementById('maintenanceCount');
        
        if (totalCount) totalCount.textContent = stats.totalAssets;
        if (goodCount) goodCount.textContent = stats.good;
        if (dueSoonCount) dueSoonCount.textContent = stats.inspection_due_soon;
        if (overdueCount) overdueCount.textContent = stats.overdue;
        if (maintenanceCount) maintenanceCount.textContent = stats.maintenance_required;
    }

    populateBuildings() {
        const buildingsList = document.getElementById('buildingsList');
        
        if (!buildingsList) return;
        
        if (this.buildings.length === 0) {
            buildingsList.innerHTML = '<div class="building-item">No buildings available</div>';
            return;
        }
        
        buildingsList.innerHTML = this.buildings.map(building => {
            const buildingStations = this.stations.filter(s => s.building === building.id);
            const totalAssets = buildingStations.reduce((sum, s) => sum + s.assets.length, 0);
            
            return `
                <div class="building-item" data-building="${building.id}" style="border-left: 4px solid ${building.color}; padding: 10px; margin: 5px 0; cursor: pointer;">
                    <h3>${building.name}</h3>
                    <p>${building.stations} stations / ${totalAssets} assets</p>
                    <small style="color: #666;">
                        ${this.getBuildingStats(building.id)}
                    </small>
                </div>
            `;
        }).join('');
        
        buildingsList.querySelectorAll('.building-item').forEach(item => {
            item.addEventListener('click', () => {
                const buildingId = parseInt(item.getAttribute('data-building'));
                this.focusOnBuilding(buildingId);
                this.hideModal('buildingsModal');
            });
        });
    }

    getBuildingStats(buildingId) {
        const buildingStations = this.stations.filter(s => s.building === buildingId);
        const statusCounts = {
            good: 0,
            inspection_due_soon: 0,
            overdue: 0,
            maintenance_required: 0
        };
        
        buildingStations.forEach(station => {
            station.assets.forEach(asset => {
                statusCounts[asset.status] = (statusCounts[asset.status] || 0) + 1;
            });
        });
        
        return `${statusCounts.good} good, ${statusCounts.inspection_due_soon} due soon, ${statusCounts.overdue} overdue, ${statusCounts.maintenance_required} maintenance`;
    }

    focusOnBuilding(buildingId) {
        const buildingStations = this.stations.filter(s => s.building === buildingId);
        
        if (buildingStations.length === 0) return;
        
        const minX = Math.min(...buildingStations.map(s => s.x));
        const maxX = Math.max(...buildingStations.map(s => s.x));
        const minY = Math.min(...buildingStations.map(s => s.y));
        const maxY = Math.max(...buildingStations.map(s => s.y));
        
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        
        const latLng = [this.MAP_HEIGHT - centerY, centerX];
        this.map.setView(latLng, -1);
    }

    showStationDetails(stationId) {
        const station = this.findStation(stationId);
        if (station) {
            this.selectedStation = station;
            this.showStationInfo(station);
        }
    }

    showStationInfo(station) {
        const stationInfo = document.getElementById('extinguisherInfo');
        
        if (!stationInfo) return;
        
        if (!station) {
            stationInfo.innerHTML = '<p>No station selected. Click on a marker to view details.</p>';
            this.showModal('infoModal');
            return;
        }
        
        const extinguishers = station.assets.filter(a => a.assetType === 'extinguisher');
        const hoses = station.assets.filter(a => a.assetType === 'hose');
        
        let content = `
            <div class="station-details">
                <div class="detail-group">
                    <h3>Station Information</h3>
                    <div class="detail-row">
                        <span class="detail-label">Station ID:</span>
                        <span class="detail-value">${station.stationId}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Building:</span>
                        <span class="detail-value">${station.buildingName}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Location:</span>
                        <span class="detail-value">${station.x}, ${station.y}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Total Assets:</span>
                        <span class="detail-value">${station.assets.length}</span>
                    </div>
                </div>
        `;
        
        if (extinguishers.length > 0) {
            content += `
                <div class="detail-group">
                    <h3>Fire Extinguishers (${extinguishers.length})</h3>
            `;
            
            extinguishers.forEach(ext => {
                const statusDetails = this.getStatusDetails(ext);
                const statusColor = this.statusColors[ext.status];
                
                content += `
                    <div style="border: 1px solid var(--color-border); border-radius: 8px; padding: 12px; margin-bottom: 8px;">
                        <div class="detail-row">
                            <span class="detail-label">Asset ID:</span>
                            <span class="detail-value">${ext.assetId}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Type:</span>
                            <span class="detail-value">${ext.type} (${ext.size})</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Manufacturer:</span>
                            <span class="detail-value">${ext.manufacturer}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">ISO Category:</span>
                            <span class="detail-value">${ext.isoCategory}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Status:</span>
                            <span class="detail-value" style="color: ${statusColor}; font-weight: bold;">
                                ${statusDetails.icon} ${statusDetails.label}
                            </span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Next Due:</span>
                            <span class="detail-value">${ext.nextDue}</span>
                        </div>
                    </div>
                `;
            });
            
            content += `</div>`;
        }
        
        if (hoses.length > 0) {
            content += `
                <div class="detail-group">
                    <h3>Fire Hoses (${hoses.length})</h3>
            `;
            
            hoses.forEach(hose => {
                const statusDetails = this.getStatusDetails(hose);
                const statusColor = this.statusColors[hose.status];
                
                content += `
                    <div style="border: 1px solid var(--color-border); border-radius: 8px; padding: 12px; margin-bottom: 8px;">
                        <div class="detail-row">
                            <span class="detail-label">Asset ID:</span>
                            <span class="detail-value">${hose.assetId}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Length:</span>
                            <span class="detail-value">${hose.length}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Manufacturer:</span>
                            <span class="detail-value">${hose.manufacturer}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Status:</span>
                            <span class="detail-value" style="color: ${statusColor}; font-weight: bold;">
                                ${statusDetails.icon} ${statusDetails.label}
                            </span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Next Due:</span>
                            <span class="detail-value">${hose.nextDue}</span>
                        </div>
                    </div>
                `;
            });
            
            content += `</div>`;
        }
        
        content += `</div>`;
        
        stationInfo.innerHTML = content;
        this.showModal('infoModal');
    }

    exportData(format) {
        const timestamp = new Date().toISOString().split('T')[0];
        
        if (format === 'csv') {
            const csv = this.convertToCSV();
            this.downloadFile(csv, `fire_safety_stations_${timestamp}.csv`, 'text/csv');
        } else if (format === 'json') {
            const exportData = {
                exported_at: new Date().toISOString(),
                total_stations: this.stations.length,
                total_assets: this.getTotalAssets(),
                buildings: this.buildings,
                stations: this.stations
            };
            const json = JSON.stringify(exportData, null, 2);
            this.downloadFile(json, `fire_safety_stations_${timestamp}.json`, 'application/json');
        }
    }

    convertToCSV() {
        const headers = ['stationId', 'building', 'buildingName', 'x', 'y', 'assetId', 'assetType', 'type', 'size', 'manufacturer', 'isoCategory', 'inspectionStickerID', 'status', 'lastInspection', 'nextDue'];
        const rows = [];
        
        this.stations.forEach(station => {
            station.assets.forEach(asset => {
                const row = [
                    station.stationId,
                    station.building,
                    station.buildingName,
                    station.x,
                    station.y,
                    asset.assetId,
                    asset.assetType,
                    asset.type,
                    asset.size,
                    asset.manufacturer || '',
                    asset.isoCategory || '',
                    asset.inspectionStickerID || '',
                    asset.status,
                    asset.lastInspection,
                    asset.nextDue
                ];
                rows.push(row.map(val => `"${val || ''}"`).join(','));
            });
        });
        
        return [headers.join(','), ...rows].join('\n');
    }

    downloadFile(content, filename, contentType) {
        const blob = new Blob([content], { type: contentType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    showError(message) {
        console.error(message);
        alert(message);
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing Fire Safety Station Manager...');
    window.app = new FireSafetyStationApp();
});
