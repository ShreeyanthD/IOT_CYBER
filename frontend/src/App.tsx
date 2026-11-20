import React, { useState, useEffect } from 'react';
import { Layout } from './layouts/Layout';
import { Dashboard } from './pages/Dashboard';
import { DatasetAnalysis } from './pages/DatasetAnalysis';
import { ModelPerformance } from './pages/ModelPerformance';
import { Settings } from './pages/Settings';
import { Login } from './pages/Login';
import { AIExplainability } from './pages/Explainability';
import { Incidents } from './pages/Incidents';
import { ReportHistory } from './pages/ReportHistory';
import { Dataset, MLModel, SystemStatus, DashboardAnalytics, PredictionExplanation, IncidentState, CaptureProcessResult } from './types';
import { apiService } from './services/api';
import { authService, type AuthUser } from './services/auth';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [activePage, setActivePage] = useState<string>('dashboard');

  useEffect(() => {
    let active = true;
    authService.restore().then(user => {
      if (!active) return;
      setCurrentUser(user);
      setIsAuthenticated(Boolean(user));
    }).finally(() => {
      if (active) setIsRestoringSession(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const handleExpiredSession = () => {
      setCurrentUser(null);
      setIsAuthenticated(false);
      setActivePage('dashboard');
    };
    window.addEventListener('iotshield:session-expired', handleExpiredSession);
    return () => window.removeEventListener('iotshield:session-expired', handleExpiredSession);
  }, []);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [selectedModel, setSelectedModel] = useState<MLModel | null>(null);
  
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [models, setModels] = useState<MLModel[]>([]);
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState<boolean>(false);
  
  // Persistent detection & packet capture results across page navigation & reload
  const [captureResult, setCaptureResult] = useState<CaptureProcessResult | null>(() => {
    try {
      const saved = sessionStorage.getItem('iotshield_last_capture');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [latestPrediction, setLatestPrediction] = useState<PredictionExplanation | null>(() => {
    try {
      const saved = sessionStorage.getItem('iotshield_latest_pred');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [activeIncident, setActiveIncident] = useState<IncidentState | null>(() => {
    try {
      const saved = sessionStorage.getItem('iotshield_active_incident');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [incidentsList, setIncidentsList] = useState<IncidentState[]>(() => {
    try {
      const saved = sessionStorage.getItem('iotshield_incidents_list');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Sync state to sessionStorage
  useEffect(() => {
    try {
      if (activeIncident) {
        sessionStorage.setItem('iotshield_active_incident', JSON.stringify(activeIncident));
      } else {
        sessionStorage.removeItem('iotshield_active_incident');
      }
    } catch (e) {}
  }, [activeIncident]);

  useEffect(() => {
    try {
      if (incidentsList && incidentsList.length > 0) {
        sessionStorage.setItem('iotshield_incidents_list', JSON.stringify(incidentsList));
      }
    } catch (e) {}
  }, [incidentsList]);

  useEffect(() => {
    try {
      if (captureResult) {
        sessionStorage.setItem('iotshield_last_capture', JSON.stringify(captureResult));
      } else {
        sessionStorage.removeItem('iotshield_last_capture');
      }
    } catch (e) {
      console.warn("Could not persist capture result to sessionStorage", e);
    }
  }, [captureResult]);

  useEffect(() => {
    try {
      if (latestPrediction) {
        sessionStorage.setItem('iotshield_latest_pred', JSON.stringify(latestPrediction));
      } else {
        sessionStorage.removeItem('iotshield_latest_pred');
      }
    } catch (e) {
      console.warn("Could not persist prediction to sessionStorage", e);
    }
  }, [latestPrediction]);

  const handleResetDetection = () => {
    setLatestPrediction(null);
    setCaptureResult(null);
    try {
      sessionStorage.removeItem('iotshield_last_capture');
      sessionStorage.removeItem('iotshield_latest_pred');
    } catch (e) {}
  };

  // Load system and configuration metadata
  const fetchStatusAndData = async () => {
    try {
      const status = await apiService.getSystemStatus();
      setSystemStatus(status);
    } catch (err) {
      console.error("Failed to check system health status", err);
    }

    try {
      const dList = await apiService.getDatasets();
      setDatasets(dList);
      
      // If we don't have a dataset selected, set the first one as active default
      if (dList.length > 0 && !selectedDataset) {
        setSelectedDataset(dList[0]);
      }
    } catch (err) {
      console.error("Failed to load dataset list", err);
    }

    try {
      const mList = await apiService.getModels();
      setModels(mList);
      
      // Select first model as active default
      if (mList.length > 0 && !selectedModel) {
        setSelectedModel(mList[0]);
      }
    } catch (err) {
      console.error("Failed to load models list", err);
    }
  };

  // Load dashboard metrics
  const loadDashboardAnalytics = async () => {
    setAnalyticsLoading(true);
    try {
      const data = await apiService.getAnalytics();
      setAnalytics(data);
    } catch (err) {
      console.error("Failed to load dashboard statistics", err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  // On mount
  useEffect(() => {
    if (!isAuthenticated) return;
    fetchStatusAndData();
    loadDashboardAnalytics();

    // Set a health check poll every 30 seconds while authenticated.
    const interval = setInterval(async () => {
      try {
        const status = await apiService.getSystemStatus();
        setSystemStatus(status);
      } catch {
        // The shared API client handles expired sessions.
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const loadIncidents = async () => {
    try {
      const list = await apiService.getSocIncidents();
      if (list && list.length > 0) {
        setIncidentsList(list);
        setActiveIncident(prev => {
          if (!prev) return list[0];
          // If active incident exists in fresh list, keep it updated
          const found = list.find(i => i.incident_id === prev.incident_id);
          return found || prev;
        });
        // Sync latest prediction for Explainability page if not yet populated
        if (!latestPrediction && list[0]?.detection) {
          const d = list[0].detection;
          setLatestPrediction({
            label: d.attack_type,
            confidence: d.confidence,
            probabilities: d.probabilities || {},
            top_contributing_features: d.top_contributing_features || [],
            shap_values: d.shap_values || {}
          });
        }
      }
    } catch (err) {
      // silent
    }
  };

  // Re-sync incidents and detections when switching between tabs
  useEffect(() => {
    if (isAuthenticated && (activePage === 'incidents' || activePage === 'dashboard' || activePage === 'explainability')) {
      loadIncidents();
    }
  }, [activePage, isAuthenticated]);

  // Sync selection defaults
  useEffect(() => {
    if (selectedDataset) {
      // Refresh list to sync modifications (like status changes)
      apiService.getDatasets().then(setDatasets).catch(() => {});
    }
  }, [selectedDataset]);

  // Callbacks
  const handlePreprocessSuccess = async () => {
    await fetchStatusAndData();
  };

  const handleLogout = async () => {
    try {
      await authService.logout();
    } finally {
      setCurrentUser(null);
      setIsAuthenticated(false);
      setSelectedDataset(null);
      setSelectedModel(null);
      setActivePage('dashboard');
    }
  };

  if (isRestoringSession) {
    return <div className="min-h-screen flex items-center justify-center bg-[#01030a] text-cyan-300 text-sm">Restoring secure session...</div>;
  }

  if (!isAuthenticated) {
    return <Login onLogin={(user) => {
      setCurrentUser(user);
      setIsAuthenticated(true);
    }} />;
  }

  return (
    <Layout
     activePage={activePage}
    setActivePage={setActivePage}
    systemStatus={systemStatus}
    selectedDataset={selectedDataset}
    selectedModel={selectedModel}
    onLogout={handleLogout}
    >
      {activePage === 'dashboard' && (
        <Dashboard
          analytics={analytics}
          loading={analyticsLoading}
          refreshData={loadDashboardAnalytics}
          selectedDataset={selectedDataset}
          selectedModel={selectedModel}
          latestPrediction={latestPrediction}
          setLatestPrediction={setLatestPrediction}
          captureResult={captureResult}
          setCaptureResult={setCaptureResult}
          onResetDetection={handleResetDetection}
          onNavigateToExplainability={() => setActivePage('explainability')}
          onNavigateToIncidents={() => setActivePage('incidents')}
          activeIncident={activeIncident}
          setActiveIncident={setActiveIncident}
          setIncidentsList={setIncidentsList}
        />
      )}

      {activePage === 'incidents' && (
        <Incidents
          activeIncident={activeIncident}
          incidentsList={incidentsList}
          setActiveIncident={setActiveIncident}
          setIncidentsList={setIncidentsList}
          onNavigateToDashboard={() => setActivePage('dashboard')}
          refreshIncidents={loadIncidents}
        />
      )}

      {activePage === 'reports' && (
        <ReportHistory />
      )}
      
      {activePage === 'dataset' && (
        <DatasetAnalysis
          selectedDataset={selectedDataset}
          setSelectedDataset={setSelectedDataset}
          onPreprocessSuccess={handlePreprocessSuccess}
        />
      )}

      {activePage === 'performance' && (
        <ModelPerformance
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
        />
      )}

      {activePage === 'explainability' && (
        <AIExplainability
          latestPrediction={latestPrediction}
          onNavigateToPrediction={() => setActivePage('dashboard')}
        />
      )}

      {activePage === 'settings' && (
        <Settings
          systemStatus={systemStatus}
          onLogout={handleLogout}
        />
      )}
    </Layout>
  );
}

export default App;
