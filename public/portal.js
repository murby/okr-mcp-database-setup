// State variables
let integrations = [];
let objectives = [];
let activeKRId = null;
let activeConnections = [];

// API base endpoint (assumed relative, served by same Express instance)
const API_BASE = '';

// Toast Notification Helper
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const iconClass = type === 'success' 
    ? 'fa-solid fa-circle-check toast-icon-success' 
    : 'fa-solid fa-triangle-exclamation toast-icon-error';
    
  toast.innerHTML = `
    <i class="${iconClass}"></i>
    <span>${message}</span>
  `;
  
  container.appendChild(toast);
  
  // Slide out and remove after 4 seconds
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4000);
}

// Fetch all Integrations configured in database
async function fetchIntegrations() {
  try {
    const res = await fetch(`${API_BASE}/api/integrations`);
    if (!res.ok) throw new Error('Failed to load integrations');
    integrations = await res.json();
    renderIntegrations();
    updateConnectionSelectOptions();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Fetch all Objectives & Key Results
async function fetchObjectives() {
  try {
    const res = await fetch(`${API_BASE}/api/objectives`);
    if (!res.ok) throw new Error('Failed to load objectives');
    objectives = await res.json();
    renderObjectives();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Check integration connection status
function getIntegrationStatus(id) {
  const integration = integrations.find(i => i.id === id);
  if (!integration) return 'disconnected';
  
  const creds = integration.credentials || {};
  const key = creds.apiKey || creds.accessToken || '';
  
  if (!key) return 'disconnected';
  if (key.toLowerCase() === 'sandbox' || key.toLowerCase().startsWith('mock-')) return 'sandbox';
  return 'connected';
}

// Render Integrations cards
function renderIntegrations() {
  const grid = document.getElementById('integrations-grid');
  grid.innerHTML = '';
  
  const supportedAPIs = [
    { id: 'hubspot', name: 'HubSpot', logo: 'fa-hubspot', desc: 'Sync CRM closed-won revenue, deal stages, and sales pipelines.' },
    { id: 'clickup', name: 'ClickUp', logo: 'fa-circle-check', desc: 'Sync task completions, sprint updates, and time tracking.' },
    { id: 'productboard', name: 'Productboard', logo: 'fa-compass', desc: 'Sync roadmap feature status and user request feedback counts.' },
    { id: 'trello', name: 'Trello', logo: 'fa-trello', desc: 'Sync card counts, checklist progress, and workflow column states.' }
  ];

  supportedAPIs.forEach(api => {
    // Check if configuration exists in DB
    const existing = integrations.find(i => i.type === api.id);
    const status = existing ? getIntegrationStatus(existing.id) : 'disconnected';
    
    let statusBadge = '<span class="badge badge-neutral">Not Configured</span>';
    let statusText = 'No active credentials. Progress updates must be written manually.';
    
    if (status === 'connected') {
      statusBadge = '<span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> Connected</span>';
      statusText = `Active connection: <strong>${existing.name}</strong>. Real-time API query active.`;
    } else if (status === 'sandbox') {
      statusBadge = '<span class="badge badge-warning"><i class="fa-solid fa-flask"></i> Sandbox Mode</span>';
      statusText = `Simulating <strong>${existing.name}</strong>. Yields simulated updates over time.`;
    }
    
    const card = document.createElement('div');
    card.className = `integration-card card-${api.id}`;
    card.innerHTML = `
      <div class="card-header-main">
        <div class="card-brand brand-${api.id}">
          <i class="fa-brands ${api.logo} brand-logo"></i>
          <div class="brand-details">
            <h3>${api.name}</h3>
            <span>${api.id.toUpperCase()} API</span>
          </div>
        </div>
        ${statusBadge}
      </div>
      <p class="card-status-info">${statusText}</p>
      <div class="card-actions">
        <button class="btn btn-secondary" onclick="openIntegrationEditor('${api.id}')">
          <i class="fa-solid fa-sliders"></i> ${existing ? 'Edit Config' : 'Configure'}
        </button>
      </div>
    `;
    grid.appendChild(card);
  });
}

// Render Objectives list
function renderObjectives() {
  const container = document.getElementById('objectives-list');
  container.innerHTML = '';
  
  if (objectives.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-folder-open"></i>
        <p>No objectives found in database. Create an objective to get started.</p>
      </div>
    `;
    return;
  }

  objectives.forEach(obj => {
    const item = document.createElement('div');
    item.className = 'objective-item';
    item.id = `obj-${obj.id}`;
    
    // Status color
    let statusBadge = `<span class="badge badge-neutral">${obj.status}</span>`;
    if (obj.status === 'on-track') statusBadge = '<span class="badge badge-success">On Track</span>';
    if (obj.status === 'at-risk') statusBadge = '<span class="badge badge-warning">At Risk</span>';
    if (obj.status === 'behind') statusBadge = '<span class="badge badge-danger">Behind</span>';
    if (obj.status === 'achieved') statusBadge = '<span class="badge badge-success" style="background:hsla(272,85%,60%,0.15);color:var(--status-achieved);border-color:hsla(272,85%,60%,0.3)">Achieved</span>';

    // Key Results HTML
    const krs = obj.keyResults || [];
    let krsHtml = '';
    
    if (krs.length === 0) {
      krsHtml = `<p class="empty-state">No key results linked to this objective.</p>`;
    } else {
      krs.forEach(kr => {
        const isAutomated = kr.source === 'automated' || (kr.connectionIds && kr.connectionIds.length > 0);
        const sourceBadge = isAutomated 
          ? '<span class="badge badge-info"><i class="fa-solid fa-robot"></i> Automated</span>' 
          : '<span class="badge badge-neutral"><i class="fa-solid fa-user"></i> Manual</span>';
          
        let valueStr = `<strong>${kr.currentValue}</strong> / ${kr.targetValue}`;
        if (kr.type === 'currency') valueStr = `<strong>$${kr.currentValue.toLocaleString()}</strong> / $${kr.targetValue.toLocaleString()}`;
        if (kr.type === 'percentage') valueStr = `<strong>${kr.currentValue}%</strong> / ${kr.targetValue}%`;
        if (kr.type === 'boolean') valueStr = kr.currentValue === 1 ? '<strong>TRUE</strong>' : '<strong>FALSE</strong>';

        krsHtml += `
          <div class="kr-item">
            <div class="kr-info">
              <h5>${kr.title}</h5>
              <p>${kr.description}</p>
            </div>
            <div>
              ${sourceBadge}
            </div>
            <div class="progress-container">
              <div class="progress-bar-wrapper">
                <div class="progress-bar-fill" style="width: ${kr.progress}%"></div>
              </div>
              <span class="progress-percent">${Math.round(kr.progress)}%</span>
            </div>
            <div class="kr-values">
              <div>${valueStr}</div>
              <div style="margin-top: 0.25rem;">
                <button class="btn-action-icon" title="Manage connections" onclick="openConnectionsManager('${kr.id}')">
                  <i class="fa-solid fa-link"></i>
                </button>
                ${isAutomated ? `
                <button class="btn-action-icon" title="Sync now" onclick="syncKeyResultData('${kr.id}', this)">
                  <i class="fa-solid fa-rotate"></i>
                </button>
                ` : ''}
              </div>
            </div>
          </div>
        `;
      });
    }

    item.innerHTML = `
      <div class="objective-trigger" onclick="toggleObjectiveExpand('${obj.id}')">
        <i class="fa-solid fa-chevron-right obj-chevron"></i>
        <div class="obj-title">
          <h4>${obj.title}</h4>
          <p>${obj.department.toUpperCase()} • Quarter: ${obj.quarter} • Owner: ${obj.owner}</p>
        </div>
        <div class="progress-container">
          <div class="progress-bar-wrapper">
            <div class="progress-bar-fill" style="width: ${obj.progress}%"></div>
          </div>
          <span class="progress-percent">${Math.round(obj.progress)}%</span>
        </div>
        <div>
          ${statusBadge}
        </div>
        <div style="text-align: right;">
          <span class="badge badge-neutral">${krs.length} Key Results</span>
        </div>
      </div>
      <div class="key-results-panel">
        <div class="kr-grid">
          ${krsHtml}
        </div>
      </div>
    `;
    container.appendChild(item);
  });
}

function toggleObjectiveExpand(id) {
  const item = document.getElementById(`obj-${id}`);
  if (item) {
    item.classList.toggle('open');
  }
}

// Integration Editor Dialog
function openIntegrationEditor(type) {
  const dialog = document.getElementById('integration-dialog');
  const title = document.getElementById('integration-dialog-title');
  const form = document.getElementById('integration-form');
  
  // Set hidden values
  document.getElementById('integration-type').value = type;
  
  const existing = integrations.find(i => i.type === type);
  document.getElementById('integration-id').value = existing ? existing.id : `${type}-integration`;
  document.getElementById('integration-name').value = existing ? existing.name : `${type.toUpperCase()} Connector`;

  // Hide all credentials fields first
  document.querySelectorAll('.credentials-fields').forEach(el => el.style.display = 'none');
  
  // Show specific fields
  const fieldsDiv = document.getElementById(`fields-${type}`);
  if (fieldsDiv) {
    fieldsDiv.style.display = 'block';
  }

  // Pre-fill credentials if existing
  if (existing && existing.credentials) {
    const creds = existing.credentials;
    if (type === 'hubspot') {
      document.getElementById('hubspot-token').value = creds.accessToken || creds.apiKey || '';
    } else if (type === 'clickup') {
      document.getElementById('clickup-token').value = creds.apiKey || creds.accessToken || '';
    } else if (type === 'productboard') {
      document.getElementById('productboard-token').value = creds.apiKey || creds.accessToken || '';
    } else if (type === 'trello') {
      document.getElementById('trello-key').value = creds.apiKey || '';
      document.getElementById('trello-token').value = creds.accessToken || creds.clientSecret || '';
    }
  } else {
    // Clear fields
    form.reset();
    document.getElementById('integration-id').value = `${type}-integration`;
    document.getElementById('integration-name').value = `${type.toUpperCase()} Connector`;
  }

  title.innerText = existing ? `Edit ${existing.name}` : `Configure ${type.toUpperCase()}`;
  dialog.showModal();
}

// Handle Integration Form Submit
document.getElementById('integration-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const id = document.getElementById('integration-id').value;
  const type = document.getElementById('integration-type').value;
  const name = document.getElementById('integration-name').value;
  const credentials = {};

  if (type === 'hubspot') {
    credentials.accessToken = document.getElementById('hubspot-token').value;
  } else if (type === 'clickup') {
    credentials.apiKey = document.getElementById('clickup-token').value;
  } else if (type === 'productboard') {
    credentials.apiKey = document.getElementById('productboard-token').value;
  } else if (type === 'trello') {
    credentials.apiKey = document.getElementById('trello-key').value;
    credentials.accessToken = document.getElementById('trello-token').value;
  }

  try {
    const res = await fetch(`${API_BASE}/api/integrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, type, name, credentials })
    });
    
    if (!res.ok) throw new Error('Failed to save configuration');
    
    showToast(`Integration '${name}' saved successfully!`);
    document.getElementById('integration-dialog').close();
    await fetchIntegrations();
    await fetchObjectives(); // Refresh progress in case mock data yields new status
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Update the options list in Key Result Connections select drop-down
function updateConnectionSelectOptions() {
  const select = document.getElementById('connection-integration-select');
  select.innerHTML = '<option value="">-- Choose Connection --</option>';
  
  integrations.forEach(i => {
    const status = getIntegrationStatus(i.id);
    const label = status === 'sandbox' ? `${i.name} (Sandbox)` : i.name;
    const option = document.createElement('option');
    option.value = i.id;
    option.innerText = label;
    select.appendChild(option);
  });
}

// Open Connections Manager for Key Result
async function openConnectionsManager(krId) {
  activeKRId = krId;
  const dialog = document.getElementById('connections-dialog');
  
  // Find key result info
  let kr = null;
  objectives.forEach(obj => {
    const found = (obj.keyResults || []).find(k => k.id === krId);
    if (found) kr = found;
  });

  if (!kr) {
    showToast('Key Result not found', 'error');
    return;
  }

  document.getElementById('connections-dialog-title').innerText = `Manage Connections: ${kr.title}`;
  document.getElementById('connections-dialog-subtitle').innerText = kr.description;
  document.getElementById('connection-kr-id').value = krId;
  document.getElementById('combination-strategy-select').value = kr.combinationStrategy || 'sum';

  // Load existing connections
  await fetchKRConnections(krId);

  // Reset Add Form
  document.getElementById('connection-form').reset();
  document.getElementById('connection-integration-select').value = '';
  document.querySelectorAll('.connection-config-fields').forEach(el => el.style.display = 'none');
  document.getElementById('test-connection-panel').style.display = 'none';
  document.getElementById('btn-save-connection').disabled = true;

  dialog.showModal();
}

// Fetch connections for selected Key Result
async function fetchKRConnections(krId) {
  try {
    const res = await fetch(`${API_BASE}/api/key-results/${krId}/connections`);
    if (!res.ok) throw new Error('Failed to load connections');
    activeConnections = await res.json();
    renderKRConnectionsList();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Render active connections inside Connections Dialog
function renderKRConnectionsList() {
  const container = document.getElementById('active-connections-list');
  container.innerHTML = '';
  
  if (activeConnections.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 1.5rem;">
        <i class="fa-solid fa-link-slash"></i>
        <p style="font-size: 0.85rem;">No active data connections linked.</p>
      </div>
    `;
    return;
  }

  activeConnections.forEach(conn => {
    const integration = integrations.find(i => i.id === conn.integrationId);
    const name = integration ? integration.name : conn.integrationId;
    const type = integration ? integration.type : 'Unknown';

    // Format query details based on configuration
    let queryDetails = '';
    const config = conn.config || {};
    if (type === 'hubspot') {
      queryDetails = `Stage: ${config.stageId || 'any'}, Metric: ${config.metricType || 'sum'}`;
    } else if (type === 'clickup') {
      queryDetails = `List ID: ${config.listId || 'any'}, Status: ${config.statusFilter || 'closed'}`;
    } else if (type === 'productboard') {
      queryDetails = `Status: ${config.statusId || 'any'}`;
    } else if (type === 'trello') {
      queryDetails = `List ID: ${config.listId || 'any'}`;
    }

    const row = document.createElement('div');
    row.className = 'connection-item-row';
    row.innerHTML = `
      <div class="conn-row-desc">
        <strong>${name} (${type.toUpperCase()})</strong>
        <span>${queryDetails} • Last Value: <strong>${conn.currentValue}</strong></span>
      </div>
      <div>
        <button class="btn-action-icon danger" title="Delete connection" onclick="deleteConnection('${conn.id}')">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    `;
    container.appendChild(row);
  });
}

// Delete Connection
async function deleteConnection(id) {
  if (!confirm('Are you sure you want to remove this data source connection?')) return;
  
  try {
    const res = await fetch(`${API_BASE}/api/connections/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete connection');
    
    showToast('Data source connection removed.');
    await fetchKRConnections(activeKRId);
    await fetchObjectives(); // Reload to update rollup progress
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Toggle connection form fields based on selected integration
document.getElementById('connection-integration-select').addEventListener('change', (e) => {
  const integrationId = e.target.value;
  const warning = document.getElementById('integration-select-warning');
  
  // Hide all field boxes
  document.querySelectorAll('.connection-config-fields').forEach(el => el.style.display = 'none');
  document.getElementById('test-connection-panel').style.display = 'none';
  document.getElementById('btn-save-connection').disabled = true;
  warning.style.display = 'none';

  if (!integrationId) return;

  const integration = integrations.find(i => i.id === integrationId);
  const status = getIntegrationStatus(integrationId);
  
  if (status === 'disconnected') {
    warning.style.display = 'block';
    return;
  }

  // Show selected fields
  const configFields = document.getElementById(`config-${integration.type}`);
  if (configFields) {
    configFields.style.display = 'block';
  }

  // Show test panel
  document.getElementById('test-connection-panel').style.display = 'block';
  document.getElementById('btn-save-connection').disabled = false;
});

// Test Connection config
document.getElementById('btn-test-connection').addEventListener('click', async () => {
  const integrationId = document.getElementById('connection-integration-select').value;
  const resultBox = document.getElementById('test-connection-result');
  const btn = document.getElementById('btn-test-connection');
  
  if (!integrationId) return;
  const integration = integrations.find(i => i.id === integrationId);

  // Compile config
  const config = compileFormConnectionConfig(integration.type);

  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Querying API...';
  btn.disabled = true;
  resultBox.style.display = 'none';

  try {
    const res = await fetch(`${API_BASE}/api/integrations/${integrationId}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config })
    });

    const data = await res.json();
    
    resultBox.style.display = 'block';
    if (res.ok) {
      resultBox.style.borderLeftColor = 'var(--status-on-track)';
      resultBox.innerHTML = `<span style="color:var(--status-on-track);"><i class="fa-solid fa-circle-check"></i> Connection Test Successful!</span><br/>Value returned: <strong>${data.value}</strong>`;
    } else {
      resultBox.style.borderLeftColor = 'var(--status-behind)';
      resultBox.innerHTML = `<span style="color:var(--status-behind);"><i class="fa-solid fa-triangle-exclamation"></i> Test Failed:</span><br/>${data.error}`;
    }
  } catch (err) {
    resultBox.style.display = 'block';
    resultBox.style.borderLeftColor = 'var(--status-behind)';
    resultBox.innerHTML = `Test Error: ${err.message}`;
  } finally {
    btn.innerHTML = '<i class="fa-solid fa-vial"></i> Test Query Configuration';
    btn.disabled = false;
  }
});

// Helper to compile form fields into connection config
function compileFormConnectionConfig(type) {
  const config = {};
  if (type === 'hubspot') {
    config.pipelineId = document.getElementById('hubspot-pipeline').value;
    config.stageId = document.getElementById('hubspot-stage').value;
    config.metricType = document.getElementById('hubspot-metric').value;
    config.metricField = document.getElementById('hubspot-field').value;
  } else if (type === 'clickup') {
    config.listId = document.getElementById('clickup-list').value;
    config.statusFilter = document.getElementById('clickup-status').value;
    config.metricType = document.getElementById('clickup-metric').value;
  } else if (type === 'productboard') {
    config.statusId = document.getElementById('productboard-status').value;
  } else if (type === 'trello') {
    config.listId = document.getElementById('trello-list').value;
  }
  return config;
}

// Add Connection Submission
document.getElementById('connection-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const keyResultId = document.getElementById('connection-kr-id').value;
  const integrationId = document.getElementById('connection-integration-select').value;
  const strategy = document.getElementById('combination-strategy-select').value;
  
  const integration = integrations.find(i => i.id === integrationId);
  const config = compileFormConnectionConfig(integration.type);

  try {
    const res = await fetch(`${API_BASE}/api/connections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyResultId,
        integrationId,
        config,
        combinationStrategy: strategy
      })
    });

    if (!res.ok) throw new Error('Failed to create connection link');
    
    showToast('Data source connection linked successfully!');
    // Refresh connections pane
    await fetchKRConnections(keyResultId);
    await fetchObjectives();
    
    // Reset form
    document.getElementById('connection-form').reset();
    document.getElementById('connection-integration-select').value = '';
    document.querySelectorAll('.connection-config-fields').forEach(el => el.style.display = 'none');
    document.getElementById('test-connection-panel').style.display = 'none';
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Update Combination Strategy on dropdown change
document.getElementById('combination-strategy-select').addEventListener('change', async (e) => {
  if (!activeKRId) return;
  const strategy = e.target.value;

  try {
    const res = await fetch(`${API_BASE}/api/connections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyResultId: activeKRId,
        integrationId: activeConnections[0]?.integrationId || 'dummy', // just updating KR strategy
        config: activeConnections[0]?.config || {},
        combinationStrategy: strategy
      })
    });
    
    if (res.ok) {
      showToast('Combination strategy updated.');
      await fetchObjectives();
    }
  } catch (err) {
    showToast('Failed to update strategy', 'error');
  }
});

// Done with connections manager, trigger a sync to compute the new value
document.getElementById('btn-close-connection-mgr').addEventListener('click', async () => {
  document.getElementById('connections-dialog').close();
  if (activeKRId && activeConnections.length > 0) {
    try {
      showToast('Recalculating Key Result value...');
      const res = await fetch(`${API_BASE}/api/key-results/${activeKRId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updatedBy: 'Portal Manager' })
      });
      if (res.ok) {
        showToast('Key Result synced and objective progress updated!');
        await fetchObjectives();
      }
    } catch (err) {
      console.error(err);
    }
  }
});

// Sync Single Key Result
async function syncKeyResultData(krId, btn) {
  const icon = btn.querySelector('i');
  icon.classList.add('syncing');
  btn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/api/key-results/${krId}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updatedBy: 'Manual Trigger' })
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to sync');
    }
    
    showToast('Key Result progress updated successfully!');
    await fetchObjectives();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    icon.classList.remove('syncing');
    btn.disabled = false;
  }
}

// Sync All Key Results
document.getElementById('btn-sync-all').addEventListener('click', async () => {
  const btn = document.getElementById('btn-sync-all');
  const icon = btn.querySelector('.sync-icon');
  
  icon.classList.add('syncing');
  btn.disabled = true;

  let syncCount = 0;
  let errorCount = 0;

  // Gather all automated key results
  const syncPromises = [];
  objectives.forEach(obj => {
    (obj.keyResults || []).forEach(kr => {
      const isAutomated = kr.source === 'automated' || (kr.connectionIds && kr.connectionIds.length > 0);
      if (isAutomated) {
        syncPromises.push(
          fetch(`${API_BASE}/api/key-results/${kr.id}/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updatedBy: 'Global Sync' })
          })
          .then(res => {
            if (res.ok) syncCount++;
            else errorCount++;
          })
          .catch(() => errorCount++)
        );
      }
    });
  });

  if (syncPromises.length === 0) {
    showToast('No automated Key Results found to sync.', 'info');
    icon.classList.remove('syncing');
    btn.disabled = false;
    return;
  }

  await Promise.all(syncPromises);
  
  icon.classList.remove('syncing');
  btn.disabled = false;

  if (errorCount === 0) {
    showToast(`Successfully synchronized all ${syncCount} automated Key Results!`);
  } else {
    showToast(`Sync finished: ${syncCount} succeeded, ${errorCount} failed. Check credentials/config.`, 'error');
  }
  
  await fetchObjectives();
});

// Initialization
async function init() {
  await fetchIntegrations();
  await fetchObjectives();
}

// Run init on load
window.addEventListener('DOMContentLoaded', init);
