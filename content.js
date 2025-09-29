// Volume controller content script
(function() {
  'use strict';

  let currentVolume = 1.0;
  let audioContext = null;
  let gainNode = null;
  let mediaElements = [];
  let originalVolumes = new WeakMap();
  let mutationObserver = null;
  let isCleanedUp = false;

  // Initialize audio context and gain node
  function initializeAudioContext() {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      gainNode = audioContext.createGain();
      gainNode.connect(audioContext.destination);
      
      // AudioContext starts in suspended state due to autoplay policy
      if (audioContext.state === 'suspended') {
        console.log('AudioContext created but suspended - waiting for user interaction');
      }
    } catch (error) {
      console.warn('AudioContext not supported, falling back to direct volume control');
    }
  }

  // Find all media elements on the page
  function findMediaElements() {
    const elements = document.querySelectorAll('audio, video');
    const newElements = Array.from(elements).filter(el => !mediaElements.includes(el));
    
    // Add new elements to the collection
    mediaElements.push(...newElements);
    
    // Store original volumes for new elements
    newElements.forEach(element => {
      if (!originalVolumes.has(element)) {
        originalVolumes.set(element, element.volume);
      }
    });
  }

  // Apply volume to all media elements
  function applyVolumeToMediaElements(volume) {
    // Remove disconnected elements
    mediaElements = mediaElements.filter(element => element.isConnected);
    
    // Find any new elements
    findMediaElements();
    
    mediaElements.forEach(element => {
      if (element.isConnected && !element.dataset.volumeControllerConnected) {
        // Only control elements not connected to Web Audio API
        const originalVolume = originalVolumes.get(element) || 1.0;
        element.volume = originalVolume * Math.min(volume, 1.0); // Cap at 100% for direct control
      }
    });
  }

  // Apply volume using Web Audio API
  function applyVolumeWithWebAudio(volume) {
    if (!audioContext || !gainNode) return false;

    try {
      gainNode.gain.setTargetAtTime(volume, audioContext.currentTime, 0.1);
      return true;
    } catch (error) {
      console.warn('Web Audio API volume control failed:', error);
      return false;
    }
  }

  // Set volume for the page
  function setPageVolume(volume) {
    currentVolume = volume;
    
    // First, try to connect media elements to Web Audio API for >100% volume
    if (volume > 1.0) {
      connectMediaElementsToWebAudio();
    }
    
    // Apply volume using Web Audio API if available
    const webAudioSuccess = applyVolumeWithWebAudio(volume);
    
    // Apply to media elements not connected to Web Audio API
    applyVolumeToMediaElements(volume);
    
    // Warn if >100% volume requested but Web Audio API not available
    if (volume > 1.0 && !webAudioSuccess && mediaElements.length > 0) {
      console.warn('Volume above 100% requires user interaction to enable Web Audio API');
    }
  }

  // Connect existing media elements to Web Audio API
  function connectMediaElementsToWebAudio() {
    if (!audioContext || !gainNode) return;

    mediaElements.forEach(element => {
      try {
        if (!element.dataset.volumeControllerConnected) {
          // Resume AudioContext if suspended
          if (audioContext.state === 'suspended') {
            audioContext.resume();
          }
          
          const source = audioContext.createMediaElementSource(element);
          source.connect(gainNode);
          element.dataset.volumeControllerConnected = 'true';
          
          // Reset element volume to maximum since Web Audio API will control it
          const originalVolume = originalVolumes.get(element) || 1.0;
          element.volume = originalVolume;
          
          console.log('Connected media element to Web Audio API');
        }
      } catch (error) {
        console.warn('Failed to connect media element to Web Audio API:', error);
      }
    });
  }

  // Observer for dynamically added media elements
  function setupMediaObserver() {
    if (mutationObserver) {
      mutationObserver.disconnect();
    }
    
    mutationObserver = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        mutation.addedNodes.forEach(function(node) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            let newMediaElements = [];
            
            if (node.matches('audio, video')) {
              newMediaElements.push(node);
            }
            
            // Check for media elements within added nodes
            const mediaInNode = node.querySelectorAll('audio, video');
            newMediaElements.push(...mediaInNode);
            
            // Process all new media elements
            newMediaElements.forEach(media => {
              if (!originalVolumes.has(media)) {
                originalVolumes.set(media, media.volume);
              }
              
              // Apply current volume
              if (currentVolume > 1.0) {
                // Try to connect to Web Audio API for >100% volume
                if (audioContext && gainNode && !media.dataset.volumeControllerConnected) {
                  try {
                    const source = audioContext.createMediaElementSource(media);
                    source.connect(gainNode);
                    media.dataset.volumeControllerConnected = 'true';
                    media.volume = originalVolumes.get(media) || 1.0;
                  } catch (error) {
                    // Fallback to direct volume control
                    media.volume = originalVolumes.get(media) || 1.0;
                  }
                }
              } else {
                // Direct volume control for ≤100%
                const originalVolume = originalVolumes.get(media) || 1.0;
                media.volume = originalVolume * currentVolume;
              }
            });
          }
        });
      });
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
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
    initializeAudioContext();
    findMediaElements();
    connectMediaElementsToWebAudio();
    setupMediaObserver();
    
    // Load saved volume from storage using URL as key
    loadSavedVolume();
    
    console.log('Volume controller initialized');
  }

  // Load saved volume for current page
  function loadSavedVolume() {
    // Use URL as storage key for persistence across page reloads
    const storageKey = `volume_url_${window.location.hostname}`;
    
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
    
    // Reset media elements to original volumes
    mediaElements.forEach(element => {
      const originalVolume = originalVolumes.get(element);
      if (originalVolume !== undefined) {
        element.volume = originalVolume;
      }
    });
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
  function handleUserActivation() {
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume().then(() => {
        console.log('AudioContext resumed after user interaction');
        // Re-apply current volume if >100%
        if (currentVolume > 1.0) {
          applyVolumeWithWebAudio(currentVolume);
        }
      }).catch(error => {
        console.warn('Failed to resume AudioContext:', error);
      });
    }
  }

  // Add event listeners for user activation (more comprehensive)
  ['click', 'touchstart', 'keydown', 'mousedown', 'pointerdown'].forEach(eventType => {
    document.addEventListener(eventType, handleUserActivation, { once: true, passive: true });
  });

})();