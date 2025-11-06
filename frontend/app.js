// frontend/app.js - Comprehensive Logic for DiplomacyLedger

const BACKEND_URL = 'https://diplomacy-ledger-api.onrender.com'; 
let currentTreatyData = {}; // Stores the original data for quick reference/comparison
let currentTreatyId = null;

// --- A. Login and RBAC Mocking (Step 6) ---
function handleLogin() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const message = document.getElementById('message');
    let userRole = null;
    let mockToken = null;

    // RBAC Check: Assign role based on mock email
    if (email === 'admin@test.gov') {
        userRole = 'admin';
        mockToken = 'MOCK_ADMIN_TOKEN';
    } else if (email === 'policy@test.gov') {
        userRole = 'policy_officer';
        mockToken = 'MOCK_POLICY_TOKEN';
    } else if (email === 'auditor@test.gov') {
        userRole = 'auditor';
        mockToken = 'MOCK_AUDITOR_TOKEN';
    }

    if (userRole) {
        localStorage.setItem('userToken', mockToken);
        localStorage.setItem('userRole', userRole);
        
        message.className = 'text-success mt-3';
        message.textContent = `Login successful as ${userRole}! Redirecting...`;
        
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1000);

    } else {
        message.textContent = 'Invalid credentials for test users.';
    }
}

// --- B. Common Utility: Get Auth Header ---
function getAuthHeaders() {
    return {
        'Authorization': `Bearer ${localStorage.getItem('userToken')}`,
        'Content-Type': 'application/json'
    };
}

// --- C. Fetch Treaties for Dashboard (Used for Search/Filter) ---
async function fetchTreaties() {
    const token = localStorage.getItem('userToken');
    if (!token) return;

    // 1. Collect Filter Data
    const searchTerm = document.getElementById('search-term')?.value;
    const filterStatus = document.getElementById('filter-status')?.value;
    const filterCategory = document.getElementById('filter-category')?.value;
    
    // 2. Build Query Parameters
    const params = new URLSearchParams();
    if (searchTerm) params.append('term', searchTerm);
    if (filterStatus) params.append('status', filterStatus);
    if (filterCategory) params.append('category', filterCategory);
    
    const queryString = params.toString();
    const url = `${BACKEND_URL}/api/treaties${queryString ? '?' + queryString : ''}`;

    try {
        const response = await fetch(url, { headers: getAuthHeaders() });
        const data = await response.json();
        
        if (response.ok) {
            renderTreaties(data);
        } else {
            document.getElementById('treaty-list').innerHTML = `<tr><td colspan="4" class="text-danger">Error: ${data.error}</td></tr>`;
        }
    } catch (error) {
        document.getElementById('treaty-list').innerHTML = `<tr><td colspan="4" class="text-danger">Network error. Is Flask running?</td></tr>`;
    }
}

// Placeholder: Renders the list of treaties on dashboard.html
function renderTreaties(treaties) {
    const list = document.getElementById('treaty-list');
    list.innerHTML = '';
    if (treaties.length === 0) {
         list.innerHTML = `<tr><td colspan="4">No treaties found matching criteria.</td></tr>`;
         return;
    }
    
    treaties.forEach(treaty => {
        const row = document.createElement('tr');
        const countries = Array.isArray(treaty.signatory_countries) ? treaty.signatory_countries.join(', ') : treaty.signatory_countries;
        
        row.innerHTML = `
            <td><a href="detail.html?id=${treaty.id}">${treaty.title}</a></td>
            <td>${treaty.current_status}</td>
            <td>${countries || 'N/A'}</td>
            <td>${treaty.expiry_date || 'Perpetual'}</td>
        `;
        list.appendChild(row);
    });
}


// --- D. Treaty Detail Logic (Steps 7, 8, 9) ---

// Fetches a single treaty's data
async function fetchTreatyDetails(id) {
    const role = localStorage.getItem('userRole');
    currentTreatyId = id; // Store ID globally
    
    // Check if user has permission to be on this page
    if (!getAuthHeaders().Authorization) {
        window.location.href = 'index.html';
        return;
    }

    try {
        const response = await fetch(`${BACKEND_URL}/api/treaties/${id}`, { headers: getAuthHeaders() });
        const data = await response.json();
        
        if (response.ok) {
            currentTreatyData = data; // Store the original data for comparison
            populateForm(data);
            
            // RBAC UI Control (Step 8 - Hiding write access for non-admins)
            if (role === 'admin') {
                document.getElementById('edit-button').classList.remove('d-none');
                document.getElementById('create-new-button')?.classList.remove('d-none');
                document.getElementById('trigger-check-button')?.classList.remove('d-none');
            } else {
                // Policy Officers/Auditors only get read access. Disable the form controls.
                toggleEditMode(false); 
            }
        } else {
            document.getElementById('treaty-title-display').textContent = data.error || "Error Loading Treaty";
        }
    } catch (error) {
        document.getElementById('treaty-title-display').textContent = "Network Error during detail fetch.";
    }
}

// Fills the form fields
function populateForm(data) {
    document.getElementById('treaty-title-display').textContent = data.title;
    document.getElementById('treaty-status-display').textContent = `Status: ${data.current_status}`;

    // Populate all form fields with current data
    document.getElementById('title').value = data.title || '';
    document.getElementById('current_status').value = data.current_status || 'Draft';
    document.getElementById('description').value = data.description || '';
    document.getElementById('signatory_countries').value = Array.isArray(data.signatory_countries) ? data.signatory_countries.join(', ') : data.signatory_countries || '';
    
    // Date fields need specific handling for correct format
    document.getElementById('date_signed').value = data.date_signed ? new Date(data.date_signed).toISOString().split('T')[0] : '';
    document.getElementById('expiry_date').value = data.expiry_date ? new Date(data.expiry_date).toISOString().split('T')[0] : '';
    document.getElementById('category').value = data.category || '';
    document.getElementById('type').value = data.type || '';
}

// Toggles form edit mode (Step 8 - Disabling input)
function toggleEditMode(isEditing) {
    const formControls = document.querySelectorAll('#treaty-form input, #treaty-form select, #treaty-form textarea');
    
    formControls.forEach(control => {
        control.disabled = !isEditing;
    });

    if (isEditing) {
        document.getElementById('edit-button').classList.add('d-none');
        document.getElementById('save-button').classList.remove('d-none');
        document.getElementById('archive-button').classList.remove('d-none');
    } else {
        const role = localStorage.getItem('userRole');
        // Only show edit button if user is admin AND not currently editing
        if (role === 'admin') {
             document.getElementById('edit-button').classList.remove('d-none');
        }
        document.getElementById('save-button').classList.add('d-none');
        document.getElementById('archive-button').classList.add('d-none');
    }
}

// frontend/app.js - Add this new function (place it near saveTreatyChanges)

async function createNewTreaty() {
    const form = document.getElementById('create-treaty-form');
    const message = document.getElementById('creation-message');

    // Basic form validation
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const newTreatyData = {
        title: document.getElementById('title').value,
        current_status: document.getElementById('current_status').value,
        description: document.getElementById('description').value,
        type: document.getElementById('type').value,
        category: document.getElementById('category').value,
        date_signed: document.getElementById('date_signed').value,
        effective_date: document.getElementById('effective_date').value,
        expiry_date: document.getElementById('expiry_date').value || null, // Allow NULL for perpetual
        // Convert comma-separated string back to array
        signatory_countries: document.getElementById('signatory_countries').value
                                .split(',').map(s => s.trim()).filter(s => s.length > 0)
    };

    message.textContent = 'Submitting...';
    message.className = 'mt-3 text-info';

    try {
        const response = await fetch(`${BACKEND_URL}/api/treaties`, {
            method: 'POST', // Calls the existing creation API
            headers: getAuthHeaders(),
            body: JSON.stringify(newTreatyData)
        });

        const result = await response.json();

        if (response.ok && response.status === 201) {
            message.textContent = `Success! Treaty "${result.title}" created and logged. Redirecting...`;
            message.className = 'mt-3 text-success';
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1500);
        } else {
            message.textContent = `Error: ${result.error || 'Creation failed. Check server logs.'}`;
            message.className = 'mt-3 text-danger';
        }

    } catch (error) {
        message.textContent = "Network Error: Could not connect to the API.";
        message.className = 'mt-3 text-danger';
    }
}

// Saves Changes (PUT Request - Step 9)
async function saveTreatyChanges() {
    const treatyId = currentTreatyData.id;
    const saveMessage = document.getElementById('save-message');
    
    const newTreatyData = {
        title: document.getElementById('title').value,
        current_status: document.getElementById('current_status').value,
        description: document.getElementById('description').value,
        date_signed: document.getElementById('date_signed').value,
        expiry_date: document.getElementById('expiry_date').value,
        category: document.getElementById('category').value,
        type: document.getElementById('type').value,
        // Convert comma-separated string back to array for the backend to handle
        signatory_countries: document.getElementById('signatory_countries').value.split(',').map(s => s.trim()).filter(s => s.length > 0),
    };

    saveMessage.textContent = 'Saving...';
    saveMessage.className = 'mt-3 text-info';

    try {
        const response = await fetch(`${BACKEND_URL}/api/treaties/${treatyId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(newTreatyData)
        });
        
        const result = await response.json();

        if (response.ok) {
            saveMessage.textContent = result.message || 'Changes saved successfully!';
            saveMessage.className = 'mt-3 text-success';
            
            // Reload data to reflect changes and new audit log
            fetchTreatyDetails(treatyId);
            fetchAuditLogs(treatyId);
            toggleEditMode(false); 
        } else {
            saveMessage.textContent = `Error: ${result.error || 'Failed to save.'}`;
            saveMessage.className = 'mt-3 text-danger';
        }
    } catch (error) {
        saveMessage.textContent = "Network error: Could not reach server.";
        saveMessage.className = 'mt-3 text-danger';
    }
}

// Fetches and displays Audit Logs (FR-AT-3)
async function fetchAuditLogs(id) {
    const auditList = document.getElementById('audit-log-list');
    auditList.innerHTML = '<li class="list-group-item text-info">Fetching logs...</li>';

    try {
        const response = await fetch(`${BACKEND_URL}/api/treaties/${id}/audit_logs`, { headers: getAuthHeaders() });
        const logs = await response.json();
        
        if (response.ok) {
            auditList.innerHTML = '';
            
            if (logs.length === 0) {
                auditList.innerHTML = '<li class="list-group-item text-muted">No audit history found. (Created via bulk import).</li>';
                return;
            }

            logs.forEach(log => {
                const item = document.createElement('li');
                item.className = 'list-group-item';
                
                let detailsText = log.action === 'CREATE' ? 'Treaty Created.' : log.action === 'ARCHIVE' ? 'Treaty Archived.' : 'Fields Updated: ';
                
                if (log.details && log.action === 'UPDATE') {
                    for (const [key, change] of Object.entries(log.details)) {
                        detailsText += `<br> ↳ <strong>${key}</strong>: "${change.old}" → "${change.new}"`;
                    }
                }

                item.innerHTML = `
                    <strong>${log.action}</strong> by User ID: ${log.user_id.substring(0, 8)}...<br>
                    <small class="text-muted">${new Date(log.timestamp).toLocaleString()}</small><br>
                    <span class="text-sm">${detailsText}</span>
                `;
                auditList.appendChild(item);
            });
        } else {
            auditList.innerHTML = `<li class="list-group-item text-danger">Error fetching logs: ${logs.error}</li>`;
        }
    } catch (error) {
        auditList.innerHTML = `<li class="list-group-item text-danger">Network Error fetching audit logs.</li>`;
    }
}

// Deletes (Archives) a Treaty (FR-TM-5)
async function deleteTreaty() {
    const treatyId = currentTreatyData.id;
    
    if (!confirm(`Are you sure you want to ARCHIVE Treaty ID ${treatyId}? This action will be logged and is irreversible.`)) {
        return;
    }

    try {
        const response = await fetch(`${BACKEND_URL}/api/treaties/${treatyId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            alert("Treaty successfully archived! Redirecting to dashboard.");
            window.location.href = 'dashboard.html';
        } else {
            const result = await response.json();
            alert(`Error archiving: ${result.error}`);
        }
    } catch (error) {
        alert("Network error: Could not connect to the server.");
    }
}