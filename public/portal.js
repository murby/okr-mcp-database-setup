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

        let explanationsHtml = '';
        if (kr.connections && kr.connections.length > 0) {
          kr.connections.forEach(conn => {
            if (conn.explanation) {
              explanationsHtml += `
                <div class="connection-explanation-text">
                  <i class="fa-solid fa-circle-info"></i> ${conn.explanation}
                </div>
              `;
            }
          });
        }

        krsHtml += `
          <div class="kr-item">
            <div class="kr-info">
              <h5>${kr.title}</h5>
              <p>${kr.description}</p>
              ${explanationsHtml}
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

// Wizard State variables
let wizardStep = 1;
let wizardObjectiveId = null;
let wizardKeyResults = [];
let wizardActiveKRId = null;
let wizardActiveConnections = [];

// Open OKR Interview Wizard
function openOkrWizard() {
  wizardStep = 1;
  wizardObjectiveId = null;
  wizardKeyResults = [];
  wizardActiveKRId = null;
  wizardActiveConnections = [];
  
  // Reset Step Panels and indicators
  updateWizardStepsUI();
  
  // Reset Step 1 options
  populateWizardObjectiveSelect();
  
  // Hide forms
  document.getElementById('wizard-obj-form-container').style.display = 'none';
  document.getElementById('wizard-obj-form').reset();
  document.getElementById('wizard-obj-id').value = '';
  
  const dialog = document.getElementById('okr-wizard-dialog');
  dialog.showModal();
}

// Close wizard
function closeOkrWizard() {
  const dialog = document.getElementById('okr-wizard-dialog');
  dialog.close();
  fetchObjectives();
}

// Populate Objectives dropdown in Step 1
function populateWizardObjectiveSelect() {
  const select = document.getElementById('wizard-objective-select');
  select.innerHTML = '<option value="">-- Select Objective to Edit/Delete --</option>';
  
  objectives.forEach(obj => {
    const option = document.createElement('option');
    option.value = obj.id;
    option.innerText = `[${obj.quarter}] ${obj.title} (${obj.department.toUpperCase()})`;
    select.appendChild(option);
  });
}

// Handle Objective Select Change in Step 1
document.getElementById('wizard-objective-select').addEventListener('change', (e) => {
  const id = e.target.value;
  const formContainer = document.getElementById('wizard-obj-form-container');
  const deleteBtn = document.getElementById('btn-delete-wizard-obj');
  const formTitle = document.getElementById('wizard-obj-form-title');
  const form = document.getElementById('wizard-obj-form');
  
  if (!id) {
    wizardObjectiveId = null;
    formContainer.style.display = 'none';
    form.reset();
    document.getElementById('wizard-obj-id').value = '';
    toggleNextButton(false);
    return;
  }
  
  wizardObjectiveId = id;
  const obj = objectives.find(o => o.id === id);
  if (obj) {
    document.getElementById('wizard-obj-id').value = obj.id;
    document.getElementById('wizard-obj-title').value = obj.title;
    document.getElementById('wizard-obj-desc').value = obj.description;
    document.getElementById('wizard-obj-dept').value = obj.department;
    document.getElementById('wizard-obj-quarter').value = obj.quarter;
    document.getElementById('wizard-obj-owner').value = obj.owner;
    
    formTitle.innerText = `Modify '${obj.title}'`;
    formContainer.style.display = 'block';
    deleteBtn.style.display = 'block';
    toggleNextButton(true);
  }
});

// Click "Create New Objective" in Step 1
document.getElementById('btn-wizard-new-obj').addEventListener('click', () => {
  wizardObjectiveId = null;
  document.getElementById('wizard-objective-select').value = '';
  
  const formContainer = document.getElementById('wizard-obj-form-container');
  const deleteBtn = document.getElementById('btn-delete-wizard-obj');
  const formTitle = document.getElementById('wizard-obj-form-title');
  const form = document.getElementById('wizard-obj-form');
  
  form.reset();
  document.getElementById('wizard-obj-id').value = '';
  
  formTitle.innerText = 'Create New Objective';
  formContainer.style.display = 'block';
  deleteBtn.style.display = 'none';
  toggleNextButton(false); // must save first
});

// Save Objective
document.getElementById('btn-save-wizard-obj').addEventListener('click', async () => {
  const title = document.getElementById('wizard-obj-title').value.trim();
  const description = document.getElementById('wizard-obj-desc').value.trim();
  const department = document.getElementById('wizard-obj-dept').value;
  const quarter = document.getElementById('wizard-obj-quarter').value.trim();
  const owner = document.getElementById('wizard-obj-owner').value.trim();
  
  if (!title || !description || !quarter || !owner) {
    showToast('Please fill out all objective fields.', 'error');
    return;
  }
  
  const payload = { title, description, department, quarter, owner };
  
  try {
    let res;
    if (wizardObjectiveId) {
      res = await fetch(`/api/objectives/${wizardObjectiveId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch('/api/objectives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
    
    if (!res.ok) throw new Error('Failed to save objective.');
    const savedObj = await res.json();
    
    showToast(`Objective '${title}' saved successfully!`);
    wizardObjectiveId = savedObj.id;
    
    // Refresh objective list in memory
    await fetchObjectives();
    populateWizardObjectiveSelect();
    document.getElementById('wizard-objective-select').value = wizardObjectiveId;
    
    document.getElementById('wizard-obj-form-title').innerText = `Modify '${title}'`;
    document.getElementById('btn-delete-wizard-obj').style.display = 'block';
    
    toggleNextButton(true);
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Delete Objective
document.getElementById('btn-delete-wizard-obj').addEventListener('click', async () => {
  if (!wizardObjectiveId) return;
  if (!confirm('Are you sure you want to delete this Objective and all of its associated Key Results, history logs, and automation connections? This action cannot be undone.')) return;
  
  try {
    const res = await fetch(`/api/objectives/${wizardObjectiveId}`, {
      method: 'DELETE'
    });
    
    if (!res.ok) throw new Error('Failed to delete objective.');
    
    showToast('Objective deleted successfully.');
    wizardObjectiveId = null;
    
    // Refresh
    await fetchObjectives();
    populateWizardObjectiveSelect();
    
    // Hide form
    document.getElementById('wizard-obj-form-container').style.display = 'none';
    document.getElementById('wizard-obj-form').reset();
    document.getElementById('wizard-objective-select').value = '';
    
    toggleNextButton(false);
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Helper to toggle Next button in footer
function toggleNextButton(enabled) {
  document.getElementById('btn-wizard-next').disabled = !enabled;
}

// Wizard steps panels display updates
function updateWizardStepsUI() {
  // Hide all panels
  document.querySelectorAll('.wizard-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.step-indicator').forEach(ind => {
    ind.classList.remove('active', 'completed');
  });
  document.querySelectorAll('.step-line').forEach(line => {
    line.classList.remove('filled', 'completed-line');
  });
  
  // Show active panel
  document.getElementById(`panel-step-${wizardStep}`).classList.add('active');
  
  // Step indicators coloring
  for (let i = 1; i <= 4; i++) {
    const ind = document.getElementById(`indicator-step-${i}`);
    if (i < wizardStep) {
      ind.classList.add('completed');
    } else if (i === wizardStep) {
      ind.classList.add('active');
    }
  }
  
  // Step lines coloring
  for (let i = 1; i <= 3; i++) {
    const line = document.querySelectorAll('.step-line')[i-1];
    if (line) {
      if (i < wizardStep - 1) {
        line.classList.add('completed-line');
      } else if (i === wizardStep - 1) {
        line.classList.add('filled');
      }
    }
  }
  
  // Footer buttons visibility
  document.getElementById('btn-wizard-back').style.display = wizardStep > 1 ? 'block' : 'none';
  document.getElementById('btn-wizard-next').style.display = wizardStep < 4 ? 'block' : 'none';
  document.getElementById('btn-wizard-finish').style.display = wizardStep === 4 ? 'block' : 'none';
  
  // Default Next button toggles
  if (wizardStep === 1) {
    toggleNextButton(!!wizardObjectiveId);
  } else if (wizardStep === 2) {
    toggleNextButton(true); // Always let them pass key results
  } else if (wizardStep === 3) {
    toggleNextButton(true); // Always let them pass automation
  }
}

// Step 2: Key Results Panel Rendering
function renderWizardKeyResults() {
  const container = document.getElementById('wizard-krs-list');
  container.innerHTML = '';
  
  if (wizardKeyResults.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 1.5rem; font-size:0.85rem;">
        <i class="fa-solid fa-list-check" style="font-size: 1.5rem; margin-bottom:0.25rem;"></i>
        <p>No key results defined yet.</p>
      </div>
    `;
    return;
  }
  
  wizardKeyResults.forEach(kr => {
    const card = document.createElement('div');
    card.className = 'wizard-item-card';
    card.id = `w-kr-card-${kr.id}`;
    card.onclick = () => selectWizardKR(kr.id);
    
    let rangeLabel = `${kr.startValue} to ${kr.targetValue}`;
    if (kr.type === 'currency') rangeLabel = `$${kr.startValue} to $${kr.targetValue}`;
    if (kr.type === 'percentage') rangeLabel = `${kr.startValue}% to ${kr.targetValue}%`;
    if (kr.type === 'boolean') rangeLabel = 'Boolean status';

    card.innerHTML = `
      <h5>${kr.title}</h5>
      <p style="font-size:0.75rem; color:var(--text-muted); line-height: 1.2; margin: 0.2rem 0;">${kr.description.substring(0, 60)}${kr.description.length > 60 ? '...' : ''}</p>
      <div class="wizard-item-card-meta">
        <span style="color:var(--accent-cyan); font-size: 0.65rem;">${kr.type.toUpperCase()}</span>
        <span style="color:var(--text-muted); font-size: 0.65rem;">Target: ${rangeLabel}</span>
      </div>
    `;
    container.appendChild(card);
  });
}

// Select a KR card in Step 2 to edit/delete
function selectWizardKR(id) {
  // Deselect previous
  document.querySelectorAll('#wizard-krs-list .wizard-item-card').forEach(c => c.classList.remove('selected'));
  
  const card = document.getElementById(`w-kr-card-${id}`);
  if (card) card.classList.add('selected');
  
  const kr = wizardKeyResults.find(k => k.id === id);
  if (kr) {
    document.getElementById('wizard-kr-id').value = kr.id;
    document.getElementById('wizard-kr-title').value = kr.title;
    document.getElementById('wizard-kr-desc').value = kr.description;
    document.getElementById('wizard-kr-type').value = kr.type;
    document.getElementById('wizard-kr-owner').value = kr.owner;
    document.getElementById('wizard-kr-start').value = kr.startValue;
    document.getElementById('wizard-kr-target').value = kr.targetValue;
    document.getElementById('wizard-kr-current').value = kr.currentValue;
    
    document.getElementById('wizard-kr-form-title').innerText = 'Modify Key Result';
    document.getElementById('btn-delete-wizard-kr').style.display = 'block';
    document.getElementById('wizard-kr-form-container').style.display = 'block';
    
    toggleKRValueFieldsVisibility(kr.type);
  }
}

// Toggle form fields based on KR Type
function toggleKRValueFieldsVisibility(type) {
  const valuesRow = document.getElementById('wizard-kr-values-row');
  if (type === 'boolean') {
    valuesRow.style.display = 'none';
  } else {
    valuesRow.style.display = 'flex';
  }
}

document.getElementById('wizard-kr-type').addEventListener('change', (e) => {
  toggleKRValueFieldsVisibility(e.target.value);
});

// Click "Add KR" button in Step 2
document.getElementById('btn-wizard-add-kr').addEventListener('click', () => {
  document.querySelectorAll('#wizard-krs-list .wizard-item-card').forEach(c => c.classList.remove('selected'));
  
  const form = document.getElementById('wizard-kr-form');
  form.reset();
  document.getElementById('wizard-kr-id').value = '';
  document.getElementById('wizard-kr-start').value = '0';
  document.getElementById('wizard-kr-target').value = '100';
  document.getElementById('wizard-kr-current').value = '0';
  
  document.getElementById('wizard-kr-form-title').innerText = 'Add Key Result';
  document.getElementById('btn-delete-wizard-kr').style.display = 'none';
  document.getElementById('wizard-kr-form-container').style.display = 'block';
  
  toggleKRValueFieldsVisibility('number');
});

// Save Key Result in Step 2
document.getElementById('btn-save-wizard-kr').addEventListener('click', async () => {
  const krId = document.getElementById('wizard-kr-id').value;
  const title = document.getElementById('wizard-kr-title').value.trim();
  const description = document.getElementById('wizard-kr-desc').value.trim();
  const type = document.getElementById('wizard-kr-type').value;
  const owner = document.getElementById('wizard-kr-owner').value.trim();
  let startValue = parseFloat(document.getElementById('wizard-kr-start').value) || 0;
  let targetValue = parseFloat(document.getElementById('wizard-kr-target').value) || 0;
  let currentValue = parseFloat(document.getElementById('wizard-kr-current').value) || 0;
  
  if (type === 'boolean') {
    startValue = 0;
    targetValue = 1;
    currentValue = 0;
  }
  
  if (!title || !description || !owner) {
    showToast('Please fill out all key result fields.', 'error');
    return;
  }
  
  const payload = {
    objectiveId: wizardObjectiveId,
    title,
    description,
    type,
    startValue,
    targetValue,
    currentValue,
    owner
  };
  
  try {
    let res;
    if (krId) {
      res = await fetch(`/api/key-results/${krId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch('/api/key-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
    
    if (!res.ok) throw new Error('Failed to save key result.');
    
    showToast(`Key Result '${title}' saved successfully!`);
    
    // Refresh list of key results
    await reloadWizardObjectiveDetails();
    document.getElementById('wizard-kr-form-container').style.display = 'none';
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Delete Key Result in Step 2
document.getElementById('btn-delete-wizard-kr').addEventListener('click', async () => {
  const krId = document.getElementById('wizard-kr-id').value;
  if (!krId) return;
  
  if (!confirm('Are you sure you want to delete this Key Result? All of its history logs and automation connection links will also be removed.')) return;
  
  try {
    const res = await fetch(`/api/key-results/${krId}`, {
      method: 'DELETE'
    });
    
    if (!res.ok) throw new Error('Failed to delete key result.');
    
    showToast('Key Result deleted.');
    await reloadWizardObjectiveDetails();
    document.getElementById('wizard-kr-form-container').style.display = 'none';
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Reload objective key results during editing
async function reloadWizardObjectiveDetails() {
  if (!wizardObjectiveId) return;
  
  try {
    const res = await fetch(`/api/objectives`);
    if (!res.ok) throw new Error('Failed to load objectives database.');
    objectives = await res.json();
    
    const currentObj = objectives.find(o => o.id === wizardObjectiveId);
    if (currentObj) {
      wizardKeyResults = currentObj.keyResults || [];
    } else {
      wizardKeyResults = [];
    }
    
    renderWizardKeyResults();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Step 3: Automation Setup
function populateWizardKRSelect() {
  const select = document.getElementById('wizard-conn-kr-select');
  select.innerHTML = '<option value="">-- Choose Key Result --</option>';
  
  wizardKeyResults.forEach(kr => {
    const option = document.createElement('option');
    option.value = kr.id;
    option.innerText = kr.title;
    select.appendChild(option);
  });
}

// Populate Step 3 Integrations dropdown
function populateWizardIntegrationsSelect() {
  const select = document.getElementById('wizard-integration-select');
  select.innerHTML = '<option value="">-- Choose Integration --</option>';
  
  integrations.forEach(i => {
    const status = getIntegrationStatus(i.id);
    const label = status === 'sandbox' ? `${i.name} (Sandbox)` : i.name;
    const option = document.createElement('option');
    option.value = i.id;
    option.innerText = label;
    select.appendChild(option);
  });
}

// Handle Select Key Result in Step 3 Automation
document.getElementById('wizard-conn-kr-select').addEventListener('change', async (e) => {
  const krId = e.target.value;
  const formPane = document.getElementById('wizard-conn-form-pane');
  
  // Clear/Reset Form
  document.getElementById('wizard-conn-form').reset();
  document.getElementById('wizard-integration-select').value = '';
  document.querySelectorAll('.wizard-conn-config').forEach(el => el.style.display = 'none');
  document.getElementById('wizard-test-panel').style.display = 'none';
  document.getElementById('btn-wizard-save-conn').disabled = true;
  document.getElementById('wizard-integration-warning').style.display = 'none';
  document.getElementById('wizard-conn-explanation').value = '';
  
  if (!krId) {
    wizardActiveKRId = null;
    formPane.style.display = 'none';
    document.getElementById('wizard-active-connections').innerHTML = '';
    return;
  }
  
  wizardActiveKRId = krId;
  const kr = wizardKeyResults.find(k => k.id === krId);
  document.getElementById('wizard-strategy-select').value = kr?.combinationStrategy || 'sum';
  
  // Fetch connections
  await fetchWizardKRConnections(krId);
  formPane.style.display = 'block';
  populateWizardIntegrationsSelect();
});

// Fetch active connections in Wizard for active KR
async function fetchWizardKRConnections(krId) {
  try {
    const res = await fetch(`/api/key-results/${krId}/connections`);
    if (!res.ok) throw new Error('Failed to load connections.');
    wizardActiveConnections = await res.json();
    renderWizardKRConnections();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Render active connections inside Step 3 Left List
function renderWizardKRConnections() {
  const container = document.getElementById('wizard-active-connections');
  container.innerHTML = '';
  
  if (wizardActiveConnections.length === 0) {
    container.innerHTML = `<p style="font-size:0.75rem; color:var(--text-muted); font-style:italic;">No automated sources connected.</p>`;
    return;
  }
  
  wizardActiveConnections.forEach(conn => {
    const integration = integrations.find(i => i.id === conn.integrationId);
    const name = integration ? integration.name : conn.integrationId;
    
    const row = document.createElement('div');
    row.className = 'wizard-sub-list-item';
    row.innerHTML = `
      <div>
        <strong>${name}</strong>
        <span style="font-size:0.7rem; color:var(--text-muted); display:block;">Last Value: ${conn.currentValue}</span>
      </div>
      <button type="button" class="btn-action-icon danger" onclick="deleteWizardKRConnection('${conn.id}')" style="padding:0.2rem 0.4rem; font-size:0.75rem;">
        <i class="fa-solid fa-trash"></i>
      </button>
    `;
    container.appendChild(row);
  });
}

// Delete connection from wizard active KR
async function deleteWizardKRConnection(id) {
  if (!confirm('Are you sure you want to remove this connection link?')) return;
  
  try {
    const res = await fetch(`/api/connections/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete connection.');
    
    showToast('Automation source disconnected.');
    await fetchWizardKRConnections(wizardActiveKRId);
    await reloadWizardObjectiveDetails();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Update combination strategy in Wizard
document.getElementById('wizard-strategy-select').addEventListener('change', async (e) => {
  if (!wizardActiveKRId) return;
  const strategy = e.target.value;
  
  try {
    // Save/update strategy on key result
    const payload = {
      combinationStrategy: strategy,
      integrationId: wizardActiveConnections[0]?.integrationId || 'dummy',
      config: wizardActiveConnections[0]?.config || {},
      keyResultId: wizardActiveKRId
    };
    
    const res = await fetch('/api/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (res.ok) {
      showToast('Combination strategy updated.');
      await reloadWizardObjectiveDetails();
    }
  } catch (err) {
    console.error(err);
  }
});

// Toggle configuration fields in Wizard
document.getElementById('wizard-integration-select').addEventListener('change', (e) => {
  const integrationId = e.target.value;
  const warning = document.getElementById('wizard-integration-warning');
  
  // Reset fields
  document.querySelectorAll('.wizard-conn-config').forEach(el => el.style.display = 'none');
  document.getElementById('wizard-test-panel').style.display = 'none';
  document.getElementById('btn-wizard-save-conn').disabled = true;
  warning.style.display = 'none';
  
  if (!integrationId) return;
  
  const status = getIntegrationStatus(integrationId);
  if (status === 'disconnected') {
    warning.style.display = 'block';
    return;
  }
  
  const integration = integrations.find(i => i.id === integrationId);
  const configBox = document.getElementById(`w-config-${integration.type}`);
  if (configBox) {
    configBox.style.display = 'block';
  }
  
  document.getElementById('wizard-test-panel').style.display = 'block';
  document.getElementById('btn-wizard-save-conn').disabled = false;
  
  // Pre-fill generated explanation
  generateWizardExplanationText();
});

// Auto-Generate Connection Explanation
function generateWizardExplanationText() {
  const integrationId = document.getElementById('wizard-integration-select').value;
  if (!integrationId) return;
  const integration = integrations.find(i => i.id === integrationId);
  
  let explanation = '';
  if (integration.type === 'hubspot') {
    const stage = document.getElementById('w-hubspot-stage').value.trim() || 'closedwon';
    const pipeline = document.getElementById('w-hubspot-pipeline').value.trim() || 'any';
    const metric = document.getElementById('w-hubspot-metric').value;
    
    if (metric === 'sum') {
      explanation = `Calculates the sum of Deal Amounts for deals in stage '${stage}' (Pipeline: ${pipeline}) in HubSpot CRM.`;
    } else {
      explanation = `Counts the total number of HubSpot CRM deals in stage '${stage}' (Pipeline: ${pipeline}).`;
    }
  } else if (integration.type === 'clickup') {
    const listId = document.getElementById('w-clickup-list').value.trim() || 'target list';
    const status = document.getElementById('w-clickup-status').value.trim() || 'complete';
    const metric = document.getElementById('w-clickup-metric').value;
    
    if (metric === 'percentage') {
      explanation = `Tracks the percentage of completed tasks (status '${status}') vs total tasks in ClickUp list ID ${listId}.`;
    } else {
      explanation = `Counts ClickUp tasks matching status '${status}' in list ID ${listId}.`;
    }
  } else if (integration.type === 'productboard') {
    const status = document.getElementById('w-productboard-status').value.trim() || 'Released';
    explanation = `Tracks the count of feature cards in Productboard with status matching '${status}'.`;
  } else if (integration.type === 'trello') {
    const listId = document.getElementById('w-trello-list').value.trim() || 'Done';
    explanation = `Counts cards in Trello board list ID ${listId} to measure task completion.`;
  }
  
  document.getElementById('wizard-conn-explanation').value = explanation;
}

// Generate button click
document.getElementById('btn-wizard-gen-explanation').addEventListener('click', generateWizardExplanationText);

// Test Connection in Wizard
document.getElementById('btn-wizard-test-conn').addEventListener('click', async () => {
  const integrationId = document.getElementById('wizard-integration-select').value;
  const resultBox = document.getElementById('wizard-test-result');
  const btn = document.getElementById('btn-wizard-test-conn');
  
  if (!integrationId) return;
  const integration = integrations.find(i => i.id === integrationId);
  
  // Compile config
  const config = compileWizardConnectionConfig(integration.type);
  
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Querying API...';
  btn.disabled = true;
  resultBox.style.display = 'none';
  
  try {
    const res = await fetch(`/api/integrations/${integrationId}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config })
    });
    const data = await res.json();
    
    resultBox.style.display = 'block';
    if (res.ok) {
      resultBox.style.borderLeftColor = 'var(--status-on-track)';
      resultBox.innerHTML = `<span style="color:var(--status-on-track);"><i class="fa-solid fa-circle-check"></i> Connection Successful!</span><br/>Simulated Query Value: <strong>${data.value}</strong>`;
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

// Helper to compile wizard connection fields
function compileWizardConnectionConfig(type) {
  const config = {};
  if (type === 'hubspot') {
    config.pipelineId = document.getElementById('w-hubspot-pipeline').value.trim();
    config.stageId = document.getElementById('w-hubspot-stage').value.trim();
    config.metricType = document.getElementById('w-hubspot-metric').value;
  } else if (type === 'clickup') {
    config.listId = document.getElementById('w-clickup-list').value.trim();
    config.statusFilter = document.getElementById('w-clickup-status').value.trim();
    config.metricType = document.getElementById('w-clickup-metric').value;
  } else if (type === 'productboard') {
    config.statusId = document.getElementById('w-productboard-status').value.trim();
  } else if (type === 'trello') {
    config.listId = document.getElementById('w-trello-list').value.trim();
  }
  return config;
}

// Link Connection in Wizard
document.getElementById('btn-wizard-save-conn').addEventListener('click', async () => {
  if (!wizardActiveKRId) return;
  
  const integrationId = document.getElementById('wizard-integration-select').value;
  const explanation = document.getElementById('wizard-conn-explanation').value.trim();
  const strategy = document.getElementById('wizard-strategy-select').value;
  
  const integration = integrations.find(i => i.id === integrationId);
  if (!integration) {
    showToast('Please select a valid integration.', 'error');
    return;
  }
  const config = compileWizardConnectionConfig(integration.type);
  
  if (!explanation) {
    showToast('Please write or generate an explanation.', 'error');
    return;
  }
  
  try {
    const res = await fetch('/api/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyResultId: wizardActiveKRId,
        integrationId,
        config,
        combinationStrategy: strategy,
        explanation
      })
    });
    
    if (!res.ok) throw new Error('Failed to connect data source.');
    
    showToast('Automation source connected successfully!');
    
    // Reset forms & refresh
    await fetchWizardKRConnections(wizardActiveKRId);
    await reloadWizardObjectiveDetails();
    
    document.getElementById('wizard-conn-form').reset();
    document.getElementById('wizard-integration-select').value = '';
    document.querySelectorAll('.wizard-conn-config').forEach(el => el.style.display = 'none');
    document.getElementById('wizard-test-panel').style.display = 'none';
    document.getElementById('wizard-conn-explanation').value = '';
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Step 4: Summary render
function renderWizardSummary() {
  const currentObj = objectives.find(o => o.id === wizardObjectiveId);
  if (!currentObj) return;
  
  document.getElementById('summary-obj-title').innerText = currentObj.title;
  document.getElementById('summary-obj-meta').innerText = `Department: ${currentObj.department.toUpperCase()} • Quarter: ${currentObj.quarter} • Owner: ${currentObj.owner}`;
  document.getElementById('summary-obj-desc').innerText = currentObj.description;
  
  const krsList = document.getElementById('summary-krs-list');
  krsList.innerHTML = '';
  
  const krs = currentObj.keyResults || [];
  if (krs.length === 0) {
    krsList.innerHTML = `<p style="font-size:0.85rem; color:var(--text-muted); font-style:italic;">No key results defined for this objective.</p>`;
    return;
  }
  
  krs.forEach(kr => {
    const row = document.createElement('div');
    row.style.background = 'var(--bg-primary)';
    row.style.border = '1px solid var(--glass-border)';
    row.style.borderRadius = '8px';
    row.style.padding = '0.75rem 1rem';
    
    let rangeLabel = `${kr.startValue} to ${kr.targetValue}`;
    if (kr.type === 'currency') rangeLabel = `$${kr.startValue} to $${kr.targetValue}`;
    if (kr.type === 'percentage') rangeLabel = `${kr.startValue}% to ${kr.targetValue}%`;
    if (kr.type === 'boolean') rangeLabel = 'Boolean';
    
    let explanationsHtml = '';
    if (kr.connections && kr.connections.length > 0) {
      kr.connections.forEach(c => {
        if (c.explanation) {
          explanationsHtml += `<div class="connection-explanation-text" style="margin-top:0.3rem;"><i class="fa-solid fa-circle-info"></i> ${c.explanation}</div>`;
        }
      });
    } else {
      explanationsHtml = `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.3rem;"><i class="fa-solid fa-user"></i> Manually updated (no API sync)</div>`;
    }
    
    row.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong style="font-size:0.9rem;">${kr.title}</strong>
        <span class="badge ${kr.connections && kr.connections.length > 0 ? 'badge-info' : 'badge-neutral'}" style="font-size:0.65rem;">
          ${kr.connections && kr.connections.length > 0 ? 'AUTOMATED' : 'MANUAL'}
        </span>
      </div>
      <p style="font-size:0.8rem; color:var(--text-muted); margin-top:0.25rem;">${kr.description}</p>
      <div style="font-size:0.75rem; font-weight:600; margin-top:0.25rem;">Target: ${rangeLabel} • Owner: ${kr.owner}</div>
      ${explanationsHtml}
    `;
    krsList.appendChild(row);
  });
}

// Wizard navigation handlers
document.getElementById('btn-wizard-next').addEventListener('click', async () => {
  if (wizardStep < 4) {
    wizardStep++;
    
    if (wizardStep === 2) {
      await reloadWizardObjectiveDetails();
    } else if (wizardStep === 3) {
      populateWizardKRSelect();
      // Reset Step 3 views
      document.getElementById('wizard-conn-kr-select').value = '';
      document.getElementById('wizard-conn-form-pane').style.display = 'none';
      document.getElementById('wizard-active-connections').innerHTML = '';
    } else if (wizardStep === 4) {
      await fetchObjectives(); // reload to get rolled up values
      renderWizardSummary();
    }
    
    updateWizardStepsUI();
  }
});

document.getElementById('btn-wizard-back').addEventListener('click', () => {
  if (wizardStep > 1) {
    wizardStep--;
    updateWizardStepsUI();
  }
});

document.getElementById('btn-wizard-cancel').addEventListener('click', () => {
  if (confirm('Are you sure you want to cancel? Any unsaved edits will be lost.')) {
    closeOkrWizard();
  }
});

document.getElementById('btn-close-wizard-top').addEventListener('click', () => {
  if (confirm('Are you sure you want to exit the wizard? Any unsaved edits will be lost.')) {
    closeOkrWizard();
  }
});

// Launch Wizard button click
document.getElementById('btn-launch-wizard').addEventListener('click', () => {
  openOkrWizard();
});

// Finish Wizard Setup
document.getElementById('btn-wizard-finish').addEventListener('click', async () => {
  document.getElementById('okr-wizard-dialog').close();
  showToast('OKR setup complete! Initialising synchronization...');
  
  // Trigger global sync of all automated key results under the objective
  const syncPromises = [];
  const currentObj = objectives.find(o => o.id === wizardObjectiveId);
  if (currentObj) {
    (currentObj.keyResults || []).forEach(kr => {
      const isAutomated = kr.source === 'automated' || (kr.connectionIds && kr.connectionIds.length > 0);
      if (isAutomated) {
        syncPromises.push(
          fetch(`/api/key-results/${kr.id}/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updatedBy: 'Wizard Finish' })
          })
          .catch(e => console.error(`Failed to sync KR ${kr.id}:`, e))
        );
      }
    });
  }
  
  if (syncPromises.length > 0) {
    await Promise.all(syncPromises);
    showToast('Sync run finished. Rollup progress updated.');
  }
  
  await fetchObjectives();
});

// Attach wizard launch to header context if possible, or bind custom actions
window.openOkrWizard = openOkrWizard;
window.closeOkrWizard = closeOkrWizard;
window.deleteWizardKRConnection = deleteWizardKRConnection;

// Initialization
async function init() {
  await fetchIntegrations();
  await fetchObjectives();
}

// Run init on load
window.addEventListener('DOMContentLoaded', init);
