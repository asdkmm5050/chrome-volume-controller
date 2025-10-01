// Volume controller content script
(function() {
  'use strict';

  let currentVolume = 1.0;
  let audioContext = null;
  let gainNode = null;
  let mediaElements = [];
  let connectedElements = new WeakSet(); // Track connected elements
  let mutationObserver = null;
  let isCleanedUp = false;
  let lastMediaQuery = 0;
  let mediaQueryThrottleTime = 500; // Throttle media element queries to 500ms
  let initializationAttempted = false;

  // Initialize audio context and gain node
  function initializeAudioContext() {
    if (initializationAttempted) return audioContext !== null;
    initializationAttempted = true;

    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      gainNode = audioContext.createGain();
      gainNode.connect(audioContext.destination);
      gainNode.gain.value = currentVolume;

      // AudioContext starts in suspended state due to autoplay policy
      if (audioContext.state === 'suspended') {
        console.log('AudioContext created but suspended - waiting for user interaction');
      } else {
        console.log('AudioContext initialized successfully');
      }
      return true;
    } catch (error) {
      console.warn('AudioContext not supported:', error);
      return false;
    }
  }

  // Find all media elements on the page (throttled)
  function findMediaElements() {
    const now = Date.now();
    if (now - lastMediaQuery < mediaQueryThrottleTime) {
      return; // Skip if called too frequently
    }
    lastMediaQuery = now;

    const elements = document.querySelectorAll('audio, video');
    const newElements = Array.from(elements).filter(el => !mediaElements.includes(el));

    // Add new elements to the collection
    mediaElements.push(...newElements);

    // Connect new elements to Web Audio API immediately
    newElements.forEach(element => {
      connectElementToWebAudio(element);
    });
  }

  // Connect a single media element to Web Audio API
  function connectElementToWebAudio(element) {
    if (!audioContext || !gainNode || connectedElements.has(element)) {
      return false;
    }

    try {
      // Check if element already has an audio source to prevent DOMException
      if (element.audioSourceNode) {
        console.log('Media element already connected to Web Audio API');
        return true;
      }

      // Set element volume to 100% since Web Audio API will control the overall volume
      element.volume = 1.0;

      const source = audioContext.createMediaElementSource(element);
      source.connect(gainNode);

      // Store reference to prevent duplicate connections
      element.audioSourceNode = source;
      connectedElements.add(element);
      element.dataset.volumeControllerConnected = 'true';

      console.log('Connected media element to Web Audio API');
      return true;
    } catch (error) {
      console.warn('Failed to connect media element to Web Audio API:', error);
      return false;
    }
  }

  // Apply volume using Web Audio API
  function applyVolumeWithWebAudio(volume) {
    if (!audioContext || !gainNode) {
      console.warn('AudioContext not available for volume control');
      return false;
    }

    try {
      // Smoothly transition to new volume
      gainNode.gain.setTargetAtTime(volume, audioContext.currentTime, 0.1);
      return true;
    } catch (error) {
      console.warn('Web Audio API volume control failed:', error);
      return false;
    }
  }

  // Set volume for the page (Web Audio API only)
  function setPageVolume(volume) {
    currentVolume = volume;

    // Ensure AudioContext is initialized
    if (!audioContext) {
      initializeAudioContext();
    }

    // Resume AudioContext if suspended
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume().then(() => {
        console.log('AudioContext resumed');
        applyVolumeWithWebAudio(volume);
      }).catch(error => {
        console.warn('Failed to resume AudioContext:', error);
      });
    } else {
      applyVolumeWithWebAudio(volume);
    }

    // Find and connect any new media elements
    findMediaElements();
    connectAllMediaElements();
  }

  // Connect all existing media elements to Web Audio API
  async function connectAllMediaElements() {
    if (!audioContext || !gainNode) {
      console.log('AudioContext not ready for connecting elements');
      return;
    }

    // Resume AudioContext if suspended before connecting elements
    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
        console.log('AudioContext resumed before connecting elements');
      } catch (error) {
        console.warn('Failed to resume AudioContext:', error);
        return;
      }
    }

    // Clean up disconnected elements
    mediaElements = mediaElements.filter(element => element.isConnected);

    // Connect all elements that aren't already connected
    mediaElements.forEach(element => {
      if (element.isConnected && !connectedElements.has(element)) {
        connectElementToWebAudio(element);
      }
    });
  }

  // Observer for dynamically added media elements (optimized)
  function setupMediaObserver() {
    if (mutationObserver) {
      mutationObserver.disconnect();
    }

    let processingQueue = [];
    let processingTimer = null;

    // Batch process media elements to avoid excessive processing
    function processMediaQueue() {
      if (processingQueue.length === 0) return;

      const mediaToProcess = [...processingQueue];
      processingQueue = [];

      mediaToProcess.forEach(media => {
        // Add to tracking array if not already there
        if (!mediaElements.includes(media)) {
          mediaElements.push(media);
        }

        // Connect to Web Audio API immediately
        connectElementToWebAudio(media);
      });
    }

    mutationObserver = new MutationObserver(function(mutations) {
      let hasNewMedia = false;

      mutations.forEach(function(mutation) {
        mutation.addedNodes.forEach(function(node) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if the node itself is a media element
            if (node.matches && node.matches('audio, video')) {
              processingQueue.push(node);
              hasNewMedia = true;
            }

            // Check for media elements within added nodes (only if necessary)
            if (node.querySelector) {
              const mediaInNode = node.querySelectorAll('audio, video');
              if (mediaInNode.length > 0) {
                processingQueue.push(...mediaInNode);
                hasNewMedia = true;
              }
            }
          }
        });
      });

      // Batch process new media elements
      if (hasNewMedia) {
        if (processingTimer) {
          clearTimeout(processingTimer);
        }
        processingTimer = setTimeout(processMediaQueue, 100); // Debounce by 100ms
      }
    });

    // Only observe if we have a document body
    if (document.body) {
      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  }

  // Message listener
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'setVolume') {
      const volume = Math.max(0, Math.min(5.0, request.volume)); // Clamp between 0 and 5.0 (500%)
      console.log('Setting page volume to:', volume);
      setPageVolume(volume);
      sendResponse({success: true, volume: volume});
      return true; // Keep the message channel open for async response
    } else if (request.action === 'getVolume') {
      console.log('Getting current volume:', currentVolume);
      sendResponse({success: true, volume: currentVolume});
      return true;
    }
  });

  // Initialize everything when page loads
  function initialize() {
    console.log('Initializing Volume Controller with Web Audio API');

    // Initialize Audio Context first
    const audioInitialized = initializeAudioContext();

    if (audioInitialized) {
      // Find existing media elements
      findMediaElements();

      // Set up observer for new elements
      setupMediaObserver();

      // Load saved volume from storage
      loadSavedVolume();

      console.log('Volume controller initialized successfully');
    } else {
      console.warn('Volume controller initialization failed - AudioContext not supported');
    }
  }

  // Safe hostname extraction
  function getHostnameFromLocation() {
    try {
      return window.location.hostname || 'unknown';
    } catch (error) {
      console.warn('Failed to get hostname:', error);
      return 'unknown';
    }
  }

  // Load saved volume for current page
  function loadSavedVolume() {
    // Use URL as storage key for persistence across page reloads
    const hostname = getHostnameFromLocation();
    const storageKey = `volume_url_${hostname}`;

    chrome.storage.local.get([storageKey], function(result) {
      if (chrome.runtime.lastError) {
        console.log('Failed to load volume:', chrome.runtime.lastError);
        return;
      }

      const savedVolume = result[storageKey];
      if (savedVolume !== undefined) {
        console.log('Restoring saved volume:', savedVolume);
        setPageVolume(savedVolume / 100);
      }
    });
  }

  // Cleanup function
  function cleanup() {
    if (isCleanedUp) return;
    isCleanedUp = true;

    console.log('Cleaning up Volume Controller');

    // Disconnect mutation observer
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }

    // Close audio context
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close().then(() => {
        console.log('AudioContext closed');
      }).catch(error => {
        console.warn('Failed to close AudioContext:', error);
      });
    }

    // Reset media elements and cleanup references
    mediaElements.forEach(element => {
      // Reset volume to 100% (since we set it to 1.0 when connecting to Web Audio API)
      element.volume = 1.0;

      // Clear audio source reference
      if (element.audioSourceNode) {
        delete element.audioSourceNode;
      }

      // Clear connection flag
      if (element.dataset.volumeControllerConnected) {
        delete element.dataset.volumeControllerConnected;
      }
    });

    // Clear tracking collections
    mediaElements = [];
    connectedElements = new WeakSet();
  }
  
  // Start initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
  
  // Cleanup on page unload
  window.addEventListener('beforeunload', cleanup);
  window.addEventListener('pagehide', cleanup);

  // Handle user activation for AudioContext
  async function handleUserActivation() {
    if (audioContext && audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
        console.log('AudioContext resumed after user interaction');

        // Re-apply current volume and connect any pending elements
        applyVolumeWithWebAudio(currentVolume);
        connectAllMediaElements();
      } catch (error) {
        console.warn('Failed to resume AudioContext:', error);
      }
    }
  }

  // Add event listeners for user activation (more comprehensive)
  ['click', 'touchstart', 'keydown', 'mousedown', 'pointerdown'].forEach(eventType => {
    document.addEventListener(eventType, handleUserActivation, { once: true, passive: true });
  });

})();