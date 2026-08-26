import axios from 'axios';

/*
  Where the API lives, worked out from how you reached the app.

  This used to name one specific homelab domain and send everyone else to
  `localhost:8002` — so the app only found its backend on the author's machine
  or the author's domain. It now reads the deployment's shape instead of a
  hostname, which is what a self-hosted app can actually rely on:

  - `VITE_API_URL` wins whenever it is set. Give it an origin
    (`https://planqer.example.com`), not a path — the callers below add `/api`.
  - On the app's own port, the API is a sibling on 8002 — at the same host you
    typed, not at `localhost`. That difference is the whole point when the
    stack runs on a homelab box you reach over the LAN.
  - Anything else means a reverse proxy is fronting both on one origin.
*/
const APP_PORT = '3001';
const API_PORT = '8002';

const getApiUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  if (typeof window === 'undefined') {
    return `http://localhost:${API_PORT}`;
  }

  const { protocol, hostname, port, origin } = window.location;

  // In local dev, Vite can auto-bump from 3000 to 3001+.
  // Keep targeting the backend sibling port regardless of the dev port.
  if (import.meta.env.DEV) {
    return `${protocol}//${hostname}:${API_PORT}`;
  }

  return port === APP_PORT ? `${protocol}//${hostname}:${API_PORT}` : origin;
};

const API_URL = getApiUrl();

// Helper function to extract meaningful error messages from API responses
const extractErrorMessage = (error) => {
  if (error.response?.data?.detail) {
    const detail = error.response.data.detail;
    if (Array.isArray(detail) && detail.length > 0) {
      // Pydantic validation error - extract the human-readable message
      return detail[0].msg || detail[0].type || 'Validation error';
    } else if (typeof detail === 'string') {
      // Simple string error message
      return detail;
    }
  }
  return error.message || 'Network error occurred';
};

/* ── local account auth ───────────────────────────────────────────────
   A local account lives on this self-hosted instance, never a cloud
   account. The token is a JWT stored in this browser's localStorage. */

const AUTH_TOKEN_KEY = 'auth_token';

export const getAuthToken = () => localStorage.getItem(AUTH_TOKEN_KEY);
const setAuthToken = (token) => localStorage.setItem(AUTH_TOKEN_KEY, token);
const clearAuthToken = () => localStorage.removeItem(AUTH_TOKEN_KEY);

const authHeaders = () => {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

axios.interceptors.request.use((config) => {
  if (config.url?.startsWith(API_URL)) {
    config.headers = { ...config.headers, ...authHeaders() };
  }
  return config;
});

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearAuthToken();
    }
    return Promise.reject(error);
  }
);

export const registerUser = async (email, password) => {
  try {
    const response = await axios.post(`${API_URL}/api/auth/register`, { email, password });
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
};

export const loginUser = async (email, password) => {
  try {
    const response = await axios.post(`${API_URL}/api/auth/login`, { email, password });
    setAuthToken(response.data.access_token);
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
};

export const logoutUser = () => clearAuthToken();

export const getSetupStatus = async () => {
  try {
    const response = await axios.get(`${API_URL}/api/auth/setup-status`);
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
};

export const getCurrentUser = async () => {
  try {
    const response = await axios.get(`${API_URL}/api/auth/me`);
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
};

/* ── local account settings ───────────────────────────────────────── */

export const getUserSettings = async () => {
  try {
    const response = await axios.get(`${API_URL}/api/settings/`);
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
};

export const updateUserSettings = async (settings) => {
  try {
    const response = await axios.put(`${API_URL}/api/settings/`, settings);
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
};

/* ── saved projects (board cutting) ───────────────────────────────── */

export const getUserProjects = async () => {
  try {
    const response = await axios.get(`${API_URL}/api/projects/`);
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
};

/* Keeping a plan is its own step: running one on /cutting-plans computes and
   returns, and nothing is stored until the user has named it here. The diagram
   is redrawn server-side from optimization_result, so none is sent. */
export const saveProject = async ({ name, projectGroupId, parts, boards, sawKerf, boardCosts, result }) => {
  const partsPayload = {};
  parts.forEach((part) => {
    const len = parseFloat(part.length);
    const qty = parseInt(part.quantity, 10);
    if (!isNaN(len) && !isNaN(qty)) {
      partsPayload[len] = qty;
    }
  });

  try {
    const response = await axios.post(`${API_URL}/api/projects/`, {
      name,
      project_group_id: projectGroupId || null,
      parts_data: partsPayload,
      board_lengths: boards.map((b) => parseFloat(b)).filter((n) => !isNaN(n)),
      saw_blade_width: parseFloat(sawKerf),
      // Null when the plan was never priced, so an unpriced plan doesn't store
      // an empty pricing panel that looks like a deliberate zero.
      board_costs: boardCosts || null,
      optimization_result: result,
    });
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
};

export const updateProject = async (projectId, updates) => {
  try {
    const response = await axios.put(`${API_URL}/api/projects/${projectId}`, updates);
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
};

export const deleteProject = async (projectId) => {
  try {
    const response = await axios.delete(`${API_URL}/api/projects/${projectId}`);
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
};

/* ── saved projects (sheet cutting) ───────────────────────────────── */

export const getUserSheetProjects = async () => {
  try {
    const response = await axios.get(`${API_URL}/api/sheet-projects/`);
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
};

export const saveSheetProject = async ({
  name, projectGroupId, parts, sheetWidth, sheetHeight, kerfWidth, materialType, algorithm, allowRotation, result,
}) => {
  try {
    const response = await axios.post(`${API_URL}/api/sheet-projects/`, {
      name,
      project_group_id: projectGroupId || null,
      parts_data: parts.map((part, index) => ({
        name: part.name || `Part ${index + 1}`,
        width: parseFloat(part.width),
        height: parseFloat(part.height),
        quantity: parseInt(part.quantity, 10),
      })),
      sheet_width: parseFloat(sheetWidth),
      sheet_height: parseFloat(sheetHeight),
      kerf_width: parseFloat(kerfWidth),
      material_type: materialType || 'plywood',
      algorithm: algorithm || null,
      allow_rotation: allowRotation !== false,
      optimization_result: result,
    });
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
};

export const updateSheetProject = async (projectId, updates) => {
  try {
    const response = await axios.put(`${API_URL}/api/sheet-projects/${projectId}`, updates);
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
};

export const deleteSheetProject = async (projectId) => {
  try {
    const response = await axios.delete(`${API_URL}/api/sheet-projects/${projectId}`);
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
};

/* ── project groups: containers holding multiple cutlists ────────── */

export const getProjectGroups = async () => {
  try {
    const response = await axios.get(`${API_URL}/api/project-groups/`);
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
};

export const createProjectGroup = async (name) => {
  try {
    const response = await axios.post(`${API_URL}/api/project-groups/`, { name });
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
};

export const renameProjectGroup = async (groupId, name) => {
  try {
    const response = await axios.put(`${API_URL}/api/project-groups/${groupId}`, { name });
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
};

export const deleteProjectGroup = async (groupId) => {
  try {
    const response = await axios.delete(`${API_URL}/api/project-groups/${groupId}`);
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
};

/* ── project image download (either project type) ────────────────── */

/* Always SVG: it is the one format stored. A PNG is made from this blob in
   the browser — see utils/svgToPng.js. */
export const downloadProjectImage = async (projectId, projectType) => {
  const endpoint = projectType === 'sheet' ? 'sheet-projects' : 'projects';
  const response = await fetch(`${API_URL}/api/${endpoint}/${projectId}/image`, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.blob();
};

/* ── admin: managing this instance's own local users ──────────────── */

export const getAdminStats = async () => {
  try {
    const response = await axios.get(`${API_URL}/api/admin/stats`);
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
};

export const getAdminUsers = async () => {
  try {
    const response = await axios.get(`${API_URL}/api/admin/users`);
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
};

export const toggleUserAdmin = async (userId, isAdmin) => {
  try {
    const response = await axios.put(`${API_URL}/api/admin/users/${userId}/toggle-admin`, { is_admin: isAdmin });
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
};

export const toggleUserActive = async (userId) => {
  try {
    const response = await axios.put(`${API_URL}/api/admin/users/${userId}/toggle-active`);
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
};

export const deleteUser = async (userId) => {
  try {
    const response = await axios.delete(`${API_URL}/api/admin/users/${userId}`);
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
};

export const resetUserPassword = async (userId, password) => {
  try {
    const response = await axios.put(`${API_URL}/api/admin/users/${userId}/password`, { password });
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
};

/* Solves and returns; it stores nothing. No project name is sent either — the
   diagram is captioned when the plan is saved, so the name can be chosen after
   the plan is on screen instead of before it exists. */
export const optimizeCutting = async (parts, boards, sawKerf, costData = null) => {
  const partsPayload = {};
  parts.forEach((part) => {
    const len = parseFloat(part.length);
    const qty = parseInt(part.quantity, 10);
    if (!isNaN(len) && !isNaN(qty)) {
      partsPayload[len] = qty;
    }
  });

  const boardLengths = boards.map((b) => parseFloat(b)).filter((n) => !isNaN(n));
  const kerfValue = parseFloat(sawKerf);

  const payload = {
    parts: partsPayload,
    available_board_lengths: boardLengths,
    saw_blade_width: kerfValue,
  };

  // Add cost analysis data if provided
  if (costData && costData.enabled) {
    payload.cost_analysis = {
      enabled: true,
      currency: costData.currency,
      board_costs: costData.boardCosts,
      optimizeFor: costData.optimizeFor || 'waste'
    };
  }

  try {
    const response = await axios.post(
      `${API_URL}/api/cutting-plans`,
      payload,
      { timeout: 15000 } // 15 seconds timeout
    );
    return response.data;
  } catch (error) {
    console.error('API request failed:', {
      url: `${API_URL}/api/cutting-plans`,
      error: error.message,
      response: error.response?.data
    });
    throw new Error(extractErrorMessage(error));
  }
};

export const optimizeSheetCutting = async (parts, sheetWidth, sheetHeight, kerfWidth, materialType, algorithm, allowRotation) => {
  const partsPayload = {};
  parts.forEach((part) => {
    const width = parseFloat(part.width);
    const height = parseFloat(part.height);
    const qty = parseInt(part.quantity, 10);
    if (!isNaN(width) && !isNaN(height) && !isNaN(qty) && width > 0 && height > 0 && qty > 0) {
      partsPayload[part.id || `part_${width}x${height}`] = {
        width: width,
        height: height,
        quantity: qty
      };
    }
  });

  const payload = {
    parts: partsPayload,
    sheet_width: parseFloat(sheetWidth),
    sheet_height: parseFloat(sheetHeight),
    kerf_width: parseFloat(kerfWidth),
    material_type: materialType || 'plywood',
    algorithm: algorithm || undefined,
    allow_rotation: allowRotation !== false
  };

  try {
    const response = await axios.post(
      `${API_URL}/api/sheet-optimization`,
      payload,
      { timeout: 30000 } // 30 seconds timeout for more complex 2D optimization
    );
    return response.data;
  } catch (error) {
    console.error('Sheet optimization API request failed:', {
      url: `${API_URL}/api/sheet-optimization`,
      error: error.message,
      response: error.response?.data
    });
    throw new Error(extractErrorMessage(error));
  }
};

/**
 * Process a 3D STL file to generate a cutting list
 * @param {File} file - The STL file to process
 * @param {string} units - Units for dimensions (mm, cm, m, in, ft)
 * @param {number} roundPrecision - Decimal places for rounding (0-3)
 * @param {string} projectName - Optional project name
 * @returns {Promise<Object>} API response with cutlist data
 */
export const process3DCutlist = async (file, units = 'mm', roundPrecision = 1, projectName = '') => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('units', units);
    formData.append('round_precision', roundPrecision.toString());
    if (projectName.trim()) {
      formData.append('project_name', projectName.trim());
    }

    const response = await axios.post(`${API_URL}/api/3d-cutlist`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 60000, // 60 second timeout for file processing
    });

    return response.data;
  } catch (error) {
    console.error('3D Cutlist API request failed:', {
      url: `${API_URL}/api/3d-cutlist`,
      error: error.message,
      response: error.response?.data
    });
    throw new Error(extractErrorMessage(error));
  }
};

/**
 * Process STEP CAD file to generate cutting list with enhanced metadata
 * @param {File} file - STEP file to process (.step or .stp)
 * @param {string} units - Units for dimensions (mm, cm, m, in, ft)  
 * @param {number} roundPrecision - Decimal places for rounding (0-3)
 * @param {string} projectName - Optional project name
 * @returns {Promise} - Processed cutting list data with CAD metadata
 */
export const processStepCutlist = async (file, units = 'mm', roundPrecision = 1, projectName = '') => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('units', units);
    formData.append('round_precision', roundPrecision.toString());
    if (projectName.trim()) {
      formData.append('project_name', projectName.trim());
    }

    const response = await axios.post(`${API_URL}/api/step-cutlist`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 120000, // 2 minutes timeout for STEP processing
    });

    return response.data;
  } catch (error) {
    console.error('STEP Cutlist API request failed:', {
      url: `${API_URL}/api/step-cutlist`,
      error: error.message,
      response: error.response?.data
    });
    throw new Error(extractErrorMessage(error));
  }
};
