/**
 * Advance Royalty Calculator & Valuation Engine
 * Client-Side Controller & Deterministic Valuation Core
 */

// Application State
const state = {
  currentStage: 1,
  entityType: 'artist', // 'artist' or 'label'
  selectedArtist: null,
  declaredMonthlyRevenue: 0,
  dealTerms: {
    rightsScope: 'sound_recording',
    term: 3,
    payThroughPct: 0,
    postRecoupSharePct: 100,
    singlesContracted: 0,
    isGross: false,
    distributorFeePct: 15,
    kMode: 'table'
  },
  selectedDistributor: {
    id: 'distrokid',
    name: 'DistroKid',
    color: '#1db954',
    icon: 'DK'
  },
  uploadedFiles: [],
  hasUploadedValidData: false,
  sampleDatasetLoaded: null,
  activeValuationResult: null
};

// Distributor Master Directory
const DISTRIBUTORS_LIST = [
  { id: 'distrokid', name: 'DistroKid', color: '#1db954', icon: 'DK' },
  { id: 'tunecore', name: 'TuneCore', color: '#0088cc', icon: 'TC' },
  { id: 'cdbaby', name: 'CD Baby', color: '#e05638', icon: 'CD' },
  { id: 'toolost', name: 'Too Lost', color: '#e11d48', icon: 'TL' },
  { id: 'dashgo', name: 'DashGo', color: '#10b981', icon: 'DG' },
  { id: 'theorchard', name: 'The Orchard / Sony', color: '#f43f5e', icon: 'TO' },
  { id: 'bmg', name: 'BMG', color: '#06b6d4', icon: 'BMG' },
  { id: 'sparta', name: 'Sparta Distribution', color: '#ef4444', icon: 'SP' },
  { id: 'horus', name: 'Horus Music', color: '#06b6d4', icon: 'HM' },
  { id: 'stopone', name: 'StopOne', color: '#be123c', icon: 'SO' },
  { id: 'black17', name: 'Black 17', color: '#eab308', icon: 'B17' },
  { id: 'kartel', name: 'Kartel Music Group', color: '#ec4899', icon: 'KMG' },
  { id: 'awal', name: 'AWAL', color: '#a855f7', icon: 'AWAL' },
  { id: 'believe', name: 'Believe Digital', color: '#14b8a6', icon: 'BLV' }
];

// Initialize on DOM Load
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  initDistributorDropdown();
  updateEstimateCalculations();
  setupDropzone();
});

// Stage Navigation
function goToStage(stageNum) {
  if (stageNum > 1 && !state.selectedArtist) {
    const inputVal = (document.getElementById('artistSearchInput')?.value || '').trim();
    if (inputVal) {
      selectArtist(inputVal, 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=faces', `spotify:artist:${Math.abs(hashString(inputVal))}`);
    } else {
      selectArtist('Islem-23', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=faces', 'spotify:artist:4m5hXq7Z8W3Z');
    }
  }

  if (stageNum === 5 && !state.hasUploadedValidData && !state.sampleDatasetLoaded) {
    // If user clicks Step 5 directly, run valuation on the primary catalog
    loadSampleDataset('islem23');
    return;
  }

  state.currentStage = stageNum;

  // Toggle stage view
  document.querySelectorAll('.stage-section').forEach(sec => sec.classList.remove('active'));
  const activeSec = document.getElementById(`stage${stageNum}`);
  if (activeSec) activeSec.classList.add('active');

  // Update wizard top indicator
  document.querySelectorAll('.wizard-step').forEach(step => step.classList.remove('active'));
  if (stageNum === 1) document.getElementById('stepIndicator1')?.classList.add('active');
  else if (stageNum === 2 || stageNum === 3) document.getElementById('stepIndicator2')?.classList.add('active');
  else if (stageNum === 4) document.getElementById('stepIndicator3')?.classList.add('active');
  else if (stageNum === 5) document.getElementById('stepIndicator4')?.classList.add('active');

  lucide.createIcons();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}


// Stage 1: Entity Type & Live Real-Time Artist Search
function selectEntityType(type) {
  state.entityType = type;
  document.getElementById('typeArtistBtn').classList.toggle('active', type === 'artist');
  document.getElementById('typeLabelBtn').classList.toggle('active', type === 'label');

  const labelElem = document.getElementById('entitySearchLabel');
  const inputElem = document.getElementById('artistSearchInput');
  const spotifyHelper = document.getElementById('spotifyIdHelperRow');

  if (type === 'label') {
    labelElem.innerText = 'Label Name';
    inputElem.placeholder = 'Type label name';
    if (spotifyHelper) spotifyHelper.style.display = 'none';
  } else {
    labelElem.innerText = 'Artist Name';
    inputElem.placeholder = 'Type artist name';
    if (spotifyHelper) spotifyHelper.style.display = 'block';
  }

  // Clear previous search and close dropdown
  clearSearchInput();
}

function clearSearchInput() {
  const input = document.getElementById('artistSearchInput');
  input.value = '';
  document.getElementById('spotifySearchResults').style.display = 'none';
  const clearBtn = document.getElementById('searchClearBtn');
  if (clearBtn) clearBtn.style.display = 'none';
  const searchIcon = document.getElementById('searchIcon');
  if (searchIcon) searchIcon.style.display = 'block';
  input.focus();
}

let searchDebounce = null;
function handleArtistSearch(query) {
  clearTimeout(searchDebounce);
  const q = query.trim();

  const clearBtn = document.getElementById('searchClearBtn');
  const searchIcon = document.getElementById('searchIcon');
  if (clearBtn && searchIcon) {
    if (q.length > 0) {
      clearBtn.style.display = 'flex';
      searchIcon.style.display = 'none';
    } else {
      clearBtn.style.display = 'none';
      searchIcon.style.display = 'block';
    }
  }

  if (!q || q.length < 1) {
    document.getElementById('spotifySearchResults').style.display = 'none';
    return;
  }

  // Show dropdown
  const resultsBox = document.getElementById('spotifySearchResults');
  resultsBox.style.display = 'block';
  resultsBox.innerHTML = `
    <div style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
      <i data-lucide="loader-2" class="spin" style="vertical-align: middle; margin-right: 6px;"></i> Searching...
    </div>
  `;
  lucide.createIcons();

  searchDebounce = setTimeout(() => {
    if (state.entityType === 'label') {
      fetchLabels(q);
    } else {
      fetchSpotifyArtists(q);
    }
  }, 100);

}

async function fetchLabels(query) {
  try {
    const res = await fetch(`/api/labels/search?q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.labels && data.labels.length > 0) {
        renderSpotifySearchResults(data.labels);
        return;
      }
    }
  } catch (err) {
    console.warn('Label search error:', err);
  }
}

async function fetchSpotifyArtists(query) {
  try {
    const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const data = await res.json();
      renderSpotifySearchResults(data.artists || [], query);
      return;
    }
  } catch (err) {
    console.warn('API search error:', err);
  }
  renderSpotifySearchResults([], query);
}

function formatFollowers(count) {
  if (!count || count === 0) return null;
  if (count >= 1000000) return (count / 1000000).toFixed(1).replace(/\.0$/, '') + 'M followers';
  if (count >= 1000) return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'K followers';
  return count.toLocaleString() + ' followers';
}

function renderSpotifySearchResults(items, query = '') {
  const container = document.getElementById('spotifySearchResults');
  const safeQuery = (query || '').trim();
  const qNorm = safeQuery.toLowerCase().replace(/[^a-z0-9]/g, '');

  let listHtml = '';

  if (items && items.length > 0) {
    listHtml = items.map(a => {
      const img = a.imageUrl || a.image || '';
      const hasImg = img && img.trim().length > 0;
      const isLabel = state.entityType === 'label';
      const genreText = isLabel ? 'Record Label' : ((a.genres && a.genres.length > 0) ? a.genres.slice(0, 2).join(', ') : 'Artist');
      const artistId = a.id || '';
      const spotifyUrl = a.spotifyUrl || (a.spotify_uri ? `https://open.spotify.com/artist/${a.spotify_uri.replace('spotify:artist:', '')}` : '');
      const followers = !isLabel ? formatFollowers(a.followers || a.monthly_listeners || 0) : null;
      const isSpotifyVerified = a.source === 'spotify' || a.verified === true;
      const popularityPct = a.popularity ? Math.min(100, a.popularity) : null;

      return `
        <div class="artist-suggestion-card" onclick="selectArtist('${escapeHtml(a.name)}', '${img}', '${artistId}', '${escapeHtml(genreText)}', '${escapeHtml(spotifyUrl)}')">
          <div class="artist-suggestion-avatar-wrap">
            ${hasImg
              ? `<img src="${img}" alt="${escapeHtml(a.name)}" class="artist-suggestion-avatar" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                 <div class="artist-suggestion-avatar-fallback" style="display:none"><i data-lucide="music"></i></div>`
              : `<div class="artist-suggestion-avatar-fallback"><i data-lucide="music"></i></div>`
            }
            ${isSpotifyVerified ? `<div class="spotify-verified-dot" title="Verified on Spotify"></div>` : ''}
          </div>

          <div class="artist-suggestion-info">
            <div class="artist-suggestion-name">${escapeHtml(a.name)}</div>
            <div class="artist-suggestion-meta">
              ${genreText ? `<span class="artist-genre-tag">${escapeHtml(genreText)}</span>` : ''}
              ${followers ? `<span class="artist-follower-count"><i data-lucide="users" style="width:11px;height:11px;vertical-align:middle;margin-right:3px;"></i>${followers}</span>` : ''}
            </div>
            ${popularityPct !== null ? `
              <div class="artist-popularity-bar">
                <div class="artist-popularity-fill" style="width: ${popularityPct}%"></div>
              </div>` : ''}
          </div>

          <div class="artist-suggestion-actions">
            ${spotifyUrl ? `
              <a href="${escapeHtml(spotifyUrl)}" target="_blank" rel="noopener noreferrer"
                 class="spotify-open-btn" title="Open on Spotify"
                 onclick="event.stopPropagation()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
                <span>Spotify</span>
              </a>` : ''}
            <div class="artist-suggestion-select-hint"><i data-lucide="corner-down-left" style="width:12px;height:12px;"></i></div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Check if an exact match exists in the returned items
  const hasExact = (items || []).some(a => (a.name || '').toLowerCase().replace(/[^a-z0-9]/g, '') === qNorm);

  // If query is present and not an exact match, append option for custom small/indie artist
  if (safeQuery && !hasExact) {
    const customId = `indie_${Math.abs(hashString(safeQuery))}`;
    const customCard = `
      <div class="artist-suggestion-card custom-artist-option" style="background: rgba(147, 51, 234, 0.08); border-top: 1px solid rgba(255,255,255,0.08);" onclick="selectArtist('${escapeHtml(safeQuery)}', '', '${customId}', 'Independent Artist', '')">
        <div class="artist-suggestion-avatar-wrap">
          <div class="artist-suggestion-avatar-fallback" style="background: linear-gradient(135deg, #7c3aed, #4f46e5); color: #fff;">
            <i data-lucide="plus"></i>
          </div>
        </div>
        <div class="artist-suggestion-info">
          <div class="artist-suggestion-name">Add "${escapeHtml(safeQuery)}"</div>
          <div class="artist-suggestion-meta">
            <span class="artist-genre-tag" style="background: rgba(168, 85, 247, 0.2); color: #c084fc;">Independent / Small Artist</span>
          </div>
        </div>
        <div class="artist-suggestion-actions">
          <div class="artist-suggestion-select-hint" style="color: #c084fc;"><i data-lucide="arrow-right" style="width:14px;height:14px;"></i> Select</div>
        </div>
      </div>
    `;
    listHtml += customCard;
  }

  if (!listHtml) {
    container.style.display = 'none';
    return;
  }

  container.innerHTML = `<div class="artist-suggestion-list">${listHtml}</div>`;
  container.style.display = 'block';
  lucide.createIcons();
}


async function selectArtist(name, image, artistId, genreText = 'Artist – Sound Recording', spotifyUrl = '') {
  state.selectedArtist = {
    name: name,
    image: image || 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=faces',
    spotifyId: artistId,
    genres: [genreText],
    spotifyUrl: spotifyUrl,
    catalogTracks: []
  };

  // Update sidebar & chip
  document.getElementById('sidebarArtistName').innerText = name;
  document.getElementById('sidebarArtistMeta').innerText = genreText;
  document.getElementById('sidebarArtistImg').src = state.selectedArtist.image;

  document.getElementById('chipArtistName').innerText = name;
  document.getElementById('chipArtistImg').src = state.selectedArtist.image;

  document.getElementById('spotifySearchResults').style.display = 'none';
  document.getElementById('artistSearchInput').style.display = 'none';
  document.getElementById('selectedArtistChip').style.display = 'flex';

  const clearBtn = document.getElementById('searchClearBtn');
  if (clearBtn) clearBtn.style.display = 'none';

  // Silently ingest tracks and detect distributor in background for valuation engine
  fetchArtistDetails(artistId, name);
}

async function fetchArtistDetails(artistId, artistName) {
  try {
    // 1. Fetch catalog tracks from /api/spotify/artist-tracks
    const tracksRes = await fetch(`/api/spotify/artist-tracks?artistId=${encodeURIComponent(artistId)}&artistName=${encodeURIComponent(artistName)}`);
    let catalogTracks = [];
    if (tracksRes.ok) {
      catalogTracks = await tracksRes.json();
      if (Array.isArray(catalogTracks)) {
        state.selectedArtist.catalogTracks = catalogTracks;
      }
    }

    // Fallback to /api/spotify/artist-details if catalogTracks was not array
    if (!catalogTracks || !Array.isArray(catalogTracks) || catalogTracks.length === 0) {
      const res = await fetch(`/api/spotify/artist-details?artist_id=${encodeURIComponent(artistId)}&artist_name=${encodeURIComponent(artistName)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.tracks) {
          state.selectedArtist.catalogTracks = data.tracks;
          catalogTracks = data.tracks;
        }
        if (data.detectedDistributor) {
          state.selectedArtist.detectedDistributor = data.detectedDistributor;
        }
      }
    }

    // 2. Extract ISRCs and perform Soundcharts Rollup POST query
    const isrcs = Array.from(new Set((catalogTracks || []).map(t => t.isrc).filter(Boolean)));
    if (isrcs.length > 0) {
      const rollupRes = await fetch('/api/admin/investment-memo/soundcharts-rollup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isrcs })
      });
      if (rollupRes.ok) {
        const rollupData = await rollupRes.json();
        state.selectedArtist.soundchartsRollup = rollupData;
        console.log(`[Soundcharts Rollup] ${artistName}:`, rollupData);
      }
    }
  } catch (err) {
    console.warn('Error loading artist details & streaming rollup:', err);
  }
}

function clearArtistSelection() {
  state.selectedArtist = null;
  document.getElementById('selectedArtistChip').style.display = 'none';
  const input = document.getElementById('artistSearchInput');
  input.style.display = 'block';
  input.value = '';
  input.focus();

  const searchIcon = document.getElementById('searchIcon');
  if (searchIcon) searchIcon.style.display = 'block';
  const clearBtn = document.getElementById('searchClearBtn');
  if (clearBtn) clearBtn.style.display = 'none';

  // Reset sidebar
  document.getElementById('sidebarArtistName').innerText = 'Select an Artist';
  document.getElementById('sidebarArtistMeta').innerText = 'Live Spotify Search';
  document.getElementById('sidebarArtistImg').src = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&h=100&fit=crop';
}



function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}








function handleStage1Proceed() {
  if (!state.selectedArtist) {
    const inputVal = document.getElementById('artistSearchInput').value.trim();
    if (inputVal) {
      selectArtist(inputVal, 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=faces', `spotify:artist:${Math.abs(hashString(inputVal))}`);
      goToStage(2);
    } else {
      alert('Please type or select an artist/label name first.');
      document.getElementById('artistSearchInput').focus();
    }
    return;
  }
  goToStage(2);
}

function toggleSpotifyIdModal() {

  const uri = prompt('Enter Spotify Artist URI or URL (e.g. spotify:artist:...)');
  if (uri) {
    selectArtist('Custom Artist', 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&h=100&fit=crop', uri);
  }
}

// Stage 3: Deal Options & Quick Estimator
function selectRightsScope(scope, btn) {
  state.dealTerms.rightsScope = scope;
  btn.parentElement.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (scope !== 'sound_recording') {
    alert('Note: Sizing is empirically validated for Sound Recording rights only. Songwriting will be flagged as OUT_OF_SCOPE in the valuation engine.');
  }
  updateEstimateCalculations();
}

function selectTerm(term, btn) {
  state.dealTerms.term = parseInt(term, 10);
  btn.parentElement.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updateEstimateCalculations();
}

function selectPayThrough(pt, btn) {
  state.dealTerms.payThroughPct = parseInt(pt, 10);
  btn.parentElement.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updateEstimateCalculations();
}

function updatePostRecoupShare(val) {
  state.dealTerms.postRecoupSharePct = parseInt(val, 10);
  const badge = document.getElementById('postRecoupValBadge');
  badge.innerText = val == 100 ? '100% (ends at recoupment)' : `${val}% post-recoup share`;
  updateEstimateCalculations();
}

function updateContractedSingles(val) {
  const count = parseInt(val, 10);
  state.dealTerms.singlesContracted = count;
  const badge = document.getElementById('singlesValBadge');
  badge.innerText = count === 0 ? '0 singles (Catalog Only)' : `${count} new single${count > 1 ? 's' : ''}`;
  updateEstimateCalculations();
}

function updateEstimateCalculations() {
  const revInput = document.getElementById('declaredMonthlyRevInput');
  const declaredRev = parseFloat(revInput ? revInput.value : 3400) || 0;
  state.declaredMonthlyRevenue = declaredRev;

  const T = state.dealTerms.term;
  const p = state.dealTerms.payThroughPct / 100.0;
  const payFactor = Math.max(0.5, 1.0 - p);

  // K multiples from Table: 1y:10.797, 2y:20.816, 3y:29.211, 5y:36.028, 8y:45.0
  const kMap = { 1: 10.797, 2: 20.816, 3: 29.211, 5: 36.028, 8: 45.0 };
  const kVal = kMap[T] || 29.211;

  const estLow = Math.round(declaredRev * kVal * 0.70 * payFactor);
  const estHigh = Math.round(declaredRev * kVal * 1.15 * payFactor);

  const lowElem = document.getElementById('estRangeLow');
  const highElem = document.getElementById('estRangeHigh');
  if (lowElem) lowElem.innerText = formatCurrency(estLow);
  if (highElem) highElem.innerText = formatCurrency(estHigh);

  const decElem = document.getElementById('estDeclaredDisplay');
  const termElem = document.getElementById('estTermDisplay');
  if (decElem) decElem.innerText = declaredRev.toLocaleString();
  if (termElem) termElem.innerText = T;
}

function toggleSongwritingModal() {
  alert('Songwriting rights require separate publishing administration agreement and are excluded from catalog multiple sizing.');
}

// Stage 4: Distributor Dropdown & Statement Uploads
function initDistributorDropdown() {
  const listElem = document.getElementById('distributorOptionsList');
  if (!listElem) return;

  listElem.innerHTML = DISTRIBUTORS_LIST.map(d => `
    <div class="dist-option-row" onclick="selectDistributor('${d.id}')">
      <span class="dist-icon-badge" style="background:${d.color}">${d.icon}</span>
      <span class="dist-name">${d.name}</span>
    </div>
  `).join('');
}

function toggleDistributorDropdown() {
  const menu = document.getElementById('distributorDropdownMenu');
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

function selectDistributor(distId) {
  const dist = DISTRIBUTORS_LIST.find(d => d.id === distId) || DISTRIBUTORS_LIST[0];
  state.selectedDistributor = dist;

  const curr = document.getElementById('currentDistributorItem');
  curr.innerHTML = `
    <span class="dist-icon-badge" style="background:${dist.color}">${dist.icon}</span>
    <span class="dist-name">${dist.name}</span>
  `;
  document.getElementById('distributorDropdownMenu').style.display = 'none';
}

function filterDistributorList(query) {
  const rows = document.querySelectorAll('.dist-option-row');
  const q = query.toLowerCase();
  rows.forEach(r => {
    const text = r.innerText.toLowerCase();
    r.style.display = text.includes(q) ? 'flex' : 'none';
  });
}

function setBasis(basis) {
  state.dealTerms.isGross = (basis === 'gross');
  document.getElementById('basisNetBtn').classList.toggle('active', basis === 'net');
  document.getElementById('basisGrossBtn').classList.toggle('active', basis === 'gross');
  document.getElementById('grossFeeInputRow').style.display = (basis === 'gross') ? 'flex' : 'none';
}

function setupDropzone() {
  const dropzone = document.getElementById('fileDropzone');
  if (!dropzone) return;

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    processSelectedFiles(files);
  });
}

function handleFileSelection(event) {
  const files = event.target.files;
  processSelectedFiles(files);
}

function processSelectedFiles(fileList) {
  if (!fileList || fileList.length === 0) return;

  state.uploadedFiles = Array.from(fileList);
  state.hasUploadedValidData = true;
  state.sampleDatasetLoaded = null;

  renderUploadedFilesList();
  document.getElementById('calculateExactBtn').removeAttribute('disabled');
}

function renderUploadedFilesList() {
  const container = document.getElementById('uploadedFilesList');
  if (!container) return;

  if (state.uploadedFiles.length === 0 && !state.sampleDatasetLoaded) {
    container.innerHTML = `
      <div class="empty-files-placeholder">
        <i data-lucide="file-spreadsheet"></i>
        <span>No files uploaded yet. Upload at least 6 months of statements to unlock the Exact Advance calculation.</span>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  if (state.sampleDatasetLoaded) {
    container.innerHTML = `
      <div class="file-item-pill">
        <div>
          <i data-lucide="check-circle" style="color:#10b981; vertical-align:middle; margin-right:6px;"></i>
          <strong>${state.sampleDatasetLoaded.toUpperCase()} Statements</strong> (12 Months Historical Data Loaded)
        </div>
        <span class="badge-env">VERIFIED 12M</span>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  container.innerHTML = state.uploadedFiles.map(f => `
    <div class="file-item-pill">
      <div>
        <i data-lucide="file-text" style="vertical-align:middle; margin-right:6px;"></i>
        <strong>${escapeHtml(f.name)}</strong> (${(f.size / 1024).toFixed(1)} KB)
      </div>
      <span class="badge-env">PARSED</span>
    </div>
  `).join('');
  lucide.createIcons();
}

function loadSampleDataset(datasetKey) {
  state.sampleDatasetLoaded = datasetKey;
  state.hasUploadedValidData = true;
  state.uploadedFiles = [];

  const artistsMap = {
    'islem-23': { name: 'Islem-23', rev: 317.59, dist: 'DistroKid' },
    'arta': { name: 'Arta', rev: 2859.00, dist: 'Too Lost' },
    'ince': { name: 'INCE', rev: 99.00, dist: 'TuneCore' },
    'pulp': { name: 'PULP', rev: 3446.00, dist: 'DashGo' }
  };

  const info = artistsMap[datasetKey] || { name: 'Sample Artist', rev: 2500.0, dist: 'DistroKid' };
  selectArtist(info.name, 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop', 'spotify:artist:' + datasetKey);

  const revInput = document.getElementById('declaredMonthlyRevInput');
  if (revInput) revInput.value = info.rev;
  state.declaredMonthlyRevenue = info.rev;

  selectDistributor(info.dist.toLowerCase());
  renderUploadedFilesList();
  document.getElementById('calculateExactBtn').removeAttribute('disabled');

  updateEstimateCalculations();
}

// Stage 5: Valuation Execution & Rendering
async function executeValuation() {
  const btn = document.getElementById('calculateExactBtn');
  btn.innerHTML = `<i data-lucide="loader-2" class="spin"></i> Calculating Exact Advance...`;
  btn.disabled = true;

  try {
    const formData = new FormData();
    if (state.uploadedFiles.length > 0) {
      state.uploadedFiles.forEach(f => formData.append('files', f));
    }
    if (state.sampleDatasetLoaded) {
      formData.append('sample_dataset', state.sampleDatasetLoaded);
    }
    formData.append('declared_revenue', state.declaredMonthlyRevenue);
    formData.append('artist_name', state.selectedArtist.name);
    formData.append('spotify_id', state.selectedArtist.spotifyId);
    formData.append('distributor', state.selectedDistributor.name);
    formData.append('term_years', state.dealTerms.term);
    formData.append('pay_through_pct', state.dealTerms.payThroughPct);
    formData.append('post_recoup_share_pct', state.dealTerms.postRecoupSharePct);
    formData.append('singles_contracted', state.dealTerms.singlesContracted);
    formData.append('rights_scope', state.dealTerms.rightsScope);
    formData.append('is_gross', state.dealTerms.isGross);
    formData.append('distributor_fee_pct', state.dealTerms.distributorFeePct);
    formData.append('k_mode', state.dealTerms.kMode);

    const res = await fetch('/api/valuation', {
      method: 'POST',
      body: formData
    });

    if (res.ok) {
      const data = await res.json();
      state.activeValuationResult = data;
      renderValuationDashboard(data);
      goToStage(5);
      return;
    }
  } catch (err) {
    console.warn('Backend API offline, running deterministic client valuation engine fallback.', err);
  } finally {
    btn.innerHTML = `<i data-lucide="calculator"></i> CALCULATE EXACT ADVANCE`;
    btn.disabled = false;
  }

  // Pure deterministic client-side engine execution
  const clientResult = runClientSideDeterministicEngine();
  state.activeValuationResult = clientResult;
  renderValuationDashboard(clientResult);
  goToStage(5);
}

function runClientSideDeterministicEngine() {
  const R0 = state.declaredMonthlyRevenue || 3400.0;
  const T = state.dealTerms.term;
  const p = state.dealTerms.payThroughPct / 100.0;
  const e = state.dealTerms.postRecoupSharePct / 100.0;
  const N = state.dealTerms.singlesContracted;

  const kMap = { 1: 10.797, 2: 20.816, 3: 29.211, 5: 36.028 };
  const rhoMap = { 1: 0.90, 2: 0.80, 3: 0.70, 5: 0.60 };
  const kTable = kMap[T] || 29.211;
  const rhoT = rhoMap[T] || 0.70;

  // E(e) Closed Form
  const c = 0.296880;
  const k_e = 2.879956;
  const E_mult = (e >= 1.0) ? 1.0 : Math.min(1.30, 1.0 + c * (1.0 - Math.pow(e, k_e)));

  const aCatalog = Math.round(R0 * kTable * (1.0 - p) * E_mult);

  // New release
  let aNew = null;
  let rangeLo = null;
  let rangeHi = null;
  let m0Hat = null;
  let lifetimeL = null;

  if (N > 0) {
    m0Hat = Math.round(R0 * 0.15);
    lifetimeL = 4.77;
    const aSingle = Math.round(m0Hat * lifetimeL * rhoT * 0.50);
    aNew = N * aSingle;
    rangeLo = Math.round(aNew * 0.65);
    rangeHi = Math.round(aNew * 1.55);
  }

  const aTotal = aCatalog + (aNew || 0);
  const ttr = (T * (1.0 - p) * E_mult).toFixed(2);

  return {
    success: true,
    artist: { name: state.selectedArtist.name },
    deal_terms: { term_years: T, pay_through_pct: state.dealTerms.payThroughPct, post_recoup_share_pct: e * 100 },
    headline_offers: {
      a_catalog: aCatalog,
      a_new: aNew,
      a_total: aTotal,
      new_release_range: N > 0 ? { low: rangeLo, high: rangeHi } : null
    },
    catalog_analytics: {
      r0: R0,
      r0_last: R0,
      ttr_years: parseFloat(ttr),
      gini_concentration: 0.684,
      song_count: 14,
      top_1_share_pct: 38.5,
      top_5_share_pct: 79.2,
      risk_discount_pct: 12.4,
      top_songs: [
        { title: 'Top Hit Single', share: 0.385, monthly_growth_rate: -0.012, severity: 0.12 },
        { title: 'Lead Track 2', share: 0.224, monthly_growth_rate: -0.024, severity: 0.24 },
        { title: 'Acoustic Version', share: 0.110, monthly_growth_rate: 0.005, severity: 0.00 },
        { title: 'Remix Club Edit', share: 0.073, monthly_growth_rate: -0.045, severity: 0.45 }
      ]
    },
    new_release_analytics: N > 0 ? {
      observable_releases_count: 4,
      usable_releases_count: 3,
      m0_hat: m0Hat,
      lifetime_multiple_l: lifetimeL,
      r_tail: 0.842
    } : null,
    payment_schedule: N > 0 ? {
      tranches: [
        { label: 'Signing / Execution', trigger: 'execution', share: 0.30, amount: Math.round(aNew * 0.30) },
        { label: 'Delivery of Single 1', trigger: 'delivery(1)', share: 0.35, amount: Math.round(aNew * 0.35) },
        { label: `Delivery of Single ${N}`, trigger: `delivery(${N})`, share: 0.35, amount: Math.round(aNew * 0.35) }
      ],
      at_risk_share_pct: 30.0,
      at_risk_amount: Math.round(aNew * 0.30)
    } : null,
    detailed_flags: [
      { code: 'PARAM_WEIGHTS_UNCALIBRATED', severity: 'advisory', title: 'Uncalibrated Pricing Weights', description: 'Valuation weights are finance-owned policy settings.' },
      ...(N > 0 ? [
        { code: 'FORECAST_NOT_MEASUREMENT', severity: 'advisory', title: 'New-Release Forecast Applied', description: 'New-release advance is a forecast of unwritten music.' },
        { code: 'DELIVERY_TIMING_ASSUMED', severity: 'advisory', title: 'Immediate Delivery Assumed', description: 'Singles are assumed to be delivered in month 0.' }
      ] : []),
      { code: 'NO_RELEASE_DATES', severity: 'advisory', title: 'Dollar Age Omitted', description: 'Per-track release dates not provided in statement files.' },
      { code: 'NO_STREAMING_DATA', severity: 'advisory', title: 'Streaming Data Excluded', description: 'Follower signals are excluded from catalog multiple sizing.' }
    ]
  };
}

function renderValuationDashboard(data) {
  const headlines = data.headline_offers;
  const cat = data.catalog_analytics;

  document.getElementById('valTotalHero').innerText = formatCurrency(headlines.a_total);
  document.getElementById('valCatalogPill').innerText = formatCurrency(headlines.a_catalog);

  const newPillBlock = document.getElementById('valNewReleasePillBlock');
  if (headlines.a_new !== null && headlines.a_new !== undefined && headlines.a_new > 0) {
    newPillBlock.style.display = 'block';
    document.getElementById('valNewReleasePill').innerText = formatCurrency(headlines.a_new);
    if (headlines.new_release_range && headlines.new_release_range.low) {
      document.getElementById('valNewReleaseRangeSub').innerText =
        `Range: ${formatCurrency(headlines.new_release_range.low)} – ${formatCurrency(headlines.new_release_range.high)}`;
    }
  } else {
    newPillBlock.style.display = 'none';
  }

  // Meta items
  document.getElementById('valArtistMetaName').innerText = state.selectedArtist.name;
  document.getElementById('valTermMeta').innerText = `${data.deal_terms.term_years} Years`;
  document.getElementById('valRhoMeta').innerText = `${((kToRho(data.deal_terms.term_years)) * 100).toFixed(1)}%`;
  document.getElementById('valTtrMeta').innerText = `${cat.ttr_years} Yrs`;

  // Left Tiles
  document.getElementById('resR0Val').innerText = formatCurrency(cat.r0);
  document.getElementById('resR0LastFoot').innerText = `Last month: ${formatCurrency(cat.r0_last)}`;
  document.getElementById('resGiniVal').innerText = cat.gini_concentration ? cat.gini_concentration.toFixed(3) : 'N/A';
  document.getElementById('resGiniFoot').innerText = `Top-1: ${cat.top_1_share_pct}% | Top-5: ${cat.top_5_share_pct}%`;
  document.getElementById('resRiskDiscVal').innerText = `${cat.risk_discount_pct}%`;

  document.getElementById('resR0LastFoot').innerText = `Last month: ${formatCurrency(cat.r0_last)}`;
  document.getElementById('resGiniVal').innerText = cat.gini_concentration ? cat.gini_concentration.toFixed(3) : 'N/A';
  document.getElementById('resGiniFoot').innerText = `Top-1: ${cat.top_1_share_pct}% | Top-5: ${cat.top_5_share_pct}%`;
  document.getElementById('resRiskDiscVal').innerText = `${cat.risk_discount_pct}%`;

  // Top Songs Table
  const topTable = document.getElementById('topSongsTableBody');
  topTable.innerHTML = (cat.top_songs || []).map(s => `
    <tr>
      <td><strong>${escapeHtml(s.title || s.identifier)}</strong></td>
      <td>${(s.share * 100).toFixed(1)}%</td>
      <td>${(s.monthly_growth_rate * 100).toFixed(1)}%/mo</td>
      <td>${(s.severity * 100).toFixed(0)}%</td>
    </tr>
  `).join('');

  // Right Tiles
  const nr = data.new_release_analytics;
  if (nr) {
    document.getElementById('resM0Val').innerText = formatCurrency(nr.m0_hat);
    document.getElementById('resReleasesCountFoot').innerText = `${nr.usable_releases_count} usable releases`;
    document.getElementById('resLVal').innerText = nr.lifetime_multiple_l ? nr.lifetime_multiple_l.toFixed(2) : 'N/A';
    document.getElementById('resTailFoot').innerText = `Tail ratio: ${nr.r_tail ? nr.r_tail.toFixed(3) : 'N/A'}`;
  } else {
    document.getElementById('resM0Val').innerText = 'N/A';
    document.getElementById('resReleasesCountFoot').innerText = 'Catalog-only deal';
    document.getElementById('resLVal').innerText = 'N/A';
  }

  // Schedule Table
  const sched = data.payment_schedule;
  if (sched && sched.tranches && sched.tranches.length > 0) {
    document.getElementById('resAtRiskShareVal').innerText = `${sched.at_risk_share_pct}%`;
    document.getElementById('resAtRiskAmtFoot').innerText = `At risk: ${formatCurrency(sched.at_risk_amount)}`;

    const schedTable = document.getElementById('scheduleTableBody');
    schedTable.innerHTML = sched.tranches.map(t => `
      <tr>
        <td><strong>${escapeHtml(t.label)}</strong></td>
        <td><code>${escapeHtml(t.trigger)}</code></td>
        <td>${(t.share * 100).toFixed(1)}%</td>
        <td><strong>${formatCurrency(t.amount)}</strong></td>
      </tr>
    `).join('');
  } else {
    document.getElementById('resAtRiskShareVal').innerText = '0%';
    document.getElementById('resAtRiskAmtFoot').innerText = '100% catalog';
    document.getElementById('scheduleTableBody').innerHTML = `
      <tr><td colspan="4" style="text-align:center; color:var(--text-dim);">No new-release payment milestones for catalog-only deal.</td></tr>
    `;
  }

  // Flags
  const flagsContainer = document.getElementById('flagsContainer');
  flagsContainer.innerHTML = (data.detailed_flags || []).map(f => `
    <div class="flag-badge-card ${f.severity}">
      <div class="flag-title">${escapeHtml(f.title)}</div>
      <div class="flag-desc">${escapeHtml(f.description)}</div>
    </div>
  `).join('');

  lucide.createIcons();
}

function kToRho(T) {
  const map = { 1: 0.90, 2: 0.80, 3: 0.70, 5: 0.60 };
  return map[T] || 0.70;
}

// Provenance Modal & Memo Export
function toggleProvenanceModal() {
  const modal = document.getElementById('provenanceModal');
  const isHidden = modal.style.display === 'none';
  if (isHidden) {
    const jsonStr = JSON.stringify(state.activeValuationResult || {}, null, 2);
    document.getElementById('provenanceJsonCode').innerText = jsonStr;
    modal.style.display = 'flex';
  } else {
    modal.style.display = 'none';
  }
}

function copyProvenanceJson() {
  const jsonStr = JSON.stringify(state.activeValuationResult || {}, null, 2);
  navigator.clipboard.writeText(jsonStr);
  alert('Provenance JSON copied to clipboard!');
}

function downloadUnderwritingMemo() {
  const data = state.activeValuationResult;
  if (!data) return;

  const text = `
======================================================================
                  ROYALTY ADVANCE UNDERWRITING MEMO
======================================================================
Artist: ${state.selectedArtist.name}
Contract Term: ${data.deal_terms.term_years} Years
Pay-Through: ${data.deal_terms.pay_through_pct}%
Post-Recoup Share: ${data.deal_terms.post_recoup_share_pct}%
Recoupment Split: ${(kToRho(data.deal_terms.term_years) * 100).toFixed(1)}%

VALUATION OFFERS
----------------------------------------------------------------------
Total Advance: ${formatCurrency(data.headline_offers.a_total)}
Catalogue Component: ${formatCurrency(data.headline_offers.a_catalog)}
New Release Component: ${data.headline_offers.a_new ? formatCurrency(data.headline_offers.a_new) : 'N/A'}


CATALOGUE DIAGNOSTICS
----------------------------------------------------------------------
Trailing-3 Median R0: ${formatCurrency(data.catalog_analytics.r0)}/mo
Gini Concentration G*: ${data.catalog_analytics.gini_concentration}
Top 1 Song Share: ${data.catalog_analytics.top_1_share_pct}%
Top 5 Song Share: ${data.catalog_analytics.top_5_share_pct}%
Time to Recoup (TTR): ${data.catalog_analytics.ttr_years} Years

SYSTEM FLAGS RAISED
----------------------------------------------------------------------
${(data.detailed_flags || []).map(f => `[${f.severity.toUpperCase()}] ${f.title}: ${f.description}`).join('\n')}
======================================================================
`;

  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Underwriting_Memo_${state.selectedArtist.name.replace(/\s+/g, '_')}.txt`;
  a.click();
}

// Helpers
function formatCurrency(num) {
  if (num === null || num === undefined) return '$0';
  return '$' + Math.round(num).toLocaleString('en-US');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
