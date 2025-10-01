document.addEventListener('DOMContentLoaded', function() {
  const volumeSlider = document.getElementById('volumeSlider');
  const volumeInput = document.getElementById('volumeInput');
  const volumeDecrease = document.getElementById('volumeDecrease');
  const volumeIncrease = document.getElementById('volumeIncrease');
  const controlButtons = document.querySelectorAll('.control-button');

  let currentTabId = null;
  let currentTabUrl = null;
  let volumeChangeTimer = null;

  // Get current tab
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs && tabs[0]) {
      currentTabId = tabs[0].id;
      currentTabUrl = tabs[0].url;
      loadSavedVolume();
    } else {
      console.error('No active tab found');
    }
  });

  // Load saved volume for current tab
  function loadSavedVolume() {
    if (!currentTabUrl) return;
    
    // Query current volume from content script first
    chrome.tabs.sendMessage(currentTabId, {
      action: 'getVolume'
    }).then(response => {
      if (response && response.volume !== undefined) {
        // Use current volume from content script
        const currentVolume = Math.round(response.volume * 100);
        volumeSlider.value = currentVolume;
        updateVolumeDisplay(currentVolume);
      } else {
        // Fallback to saved volume
        loadSavedVolumeFromStorage();
      }
    }).catch(error => {
      // Content script not ready, use saved volume
      loadSavedVolumeFromStorage();
    });
  }

  // Safe hostname extraction from URL
  function getHostnameFromUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname || 'unknown';
    } catch (error) {
      console.warn('Invalid URL:', url);
      return 'unknown';
    }
  }

  // Load volume from storage (fallback)
  function loadSavedVolumeFromStorage() {
    const hostname = getHostnameFromUrl(currentTabUrl);
    const storageKey = `volume_url_${hostname}`;

    chrome.storage.local.get([storageKey], function(result) {
      if (chrome.runtime.lastError) {
        console.error('Failed to load volume:', chrome.runtime.lastError);
        return;
      }
      const savedVolume = result[storageKey] || 100;
      volumeSlider.value = savedVolume;
      updateVolumeDisplay(savedVolume);
    });
  }

  // Update volume display and slider progress
  function updateVolumeDisplay(volume) {
    volumeInput.value = volume;
    
    // Update slider track fill using CSS custom property
    const percentage = (volume / 500) * 100;
    volumeSlider.style.setProperty('--slider-progress', `${percentage}%`);
  }

  // Send volume change to content script with different behaviors
  function sendVolumeChange(volume, mode = 'debounced') {
    if (!currentTabId) return;

    // Always update display immediately for visual feedback
    updateVolumeDisplay(volume);

    switch (mode) {
      case 'immediate':
        // For button clicks - apply immediately
        if (volumeChangeTimer) {
          clearTimeout(volumeChangeTimer);
          volumeChangeTimer = null;
        }
        performVolumeChange(volume);
        break;

      case 'debounced':
        // For slider movements - debounced for performance
        if (volumeChangeTimer) {
          clearTimeout(volumeChangeTimer);
        }
        volumeChangeTimer = setTimeout(() => {
          performVolumeChange(volume);
          volumeChangeTimer = null;
        }, 50); // 50ms debounce
        break;

      case 'deferred':
        // For keyboard input - don't apply until editing is finished
        // Only update display, don't send to content script
        break;

      default:
        console.warn('Unknown volume change mode:', mode);
    }
  }

  // Apply volume change immediately (for input field when editing is done)
  function applyVolumeChange(volume) {
    if (!currentTabId) return;

    updateVolumeDisplay(volume);

    // Cancel any pending debounced changes
    if (volumeChangeTimer) {
      clearTimeout(volumeChangeTimer);
      volumeChangeTimer = null;
    }

    performVolumeChange(volume);
  }

  // Actual volume change implementation
  function performVolumeChange(volume) {
    chrome.tabs.sendMessage(currentTabId, {
      action: 'setVolume',
      volume: volume / 100
    }).catch(error => {
      // Ignore connection errors - content script may not be ready yet
      console.log('Content script not ready:', error);
    });

    // Save volume for current tab (by hostname)
    if (currentTabUrl) {
      const hostname = getHostnameFromUrl(currentTabUrl);
      const storageKey = `volume_url_${hostname}`;

      chrome.storage.local.set({
        [storageKey]: volume
      }, function() {
        if (chrome.runtime.lastError) {
          console.error('Failed to save volume:', chrome.runtime.lastError);
        }
      });
    }
  }

  // Validate and constrain volume value
  function validateVolume(value) {
    const num = parseInt(value);
    if (isNaN(num)) return 100;
    return Math.max(0, Math.min(500, num));
  }

  // Slider change event - immediate application with slight debounce for performance
  volumeSlider.addEventListener('input', function() {
    const volume = parseInt(this.value);
    sendVolumeChange(volume, 'debounced'); // Use debounced for smooth slider dragging
  });

  // Store original value when input starts
  let originalValue = volumeInput.value;
  let isInputFocused = false;

  volumeInput.addEventListener('focus', function() {
    originalValue = this.value;
    isInputFocused = true;
  });

  // Volume input change during typing (for display feedback only)
  volumeInput.addEventListener('input', function() {
    if (!isInputFocused) return;

    const inputValue = this.value.trim();
    const numValue = parseInt(inputValue);

    // Only update display if value is valid, don't apply to audio
    if (inputValue !== '' && !isNaN(numValue) && numValue >= 0 && numValue <= 500) {
      // Update slider position for visual feedback
      volumeSlider.value = numValue;
      // Use deferred mode - only visual update, no audio change
      sendVolumeChange(numValue, 'deferred');
    }
  });

  // Volume input blur event (when user clicks away - apply changes)
  volumeInput.addEventListener('blur', function() {
    isInputFocused = false;
    const inputValue = this.value.trim();
    const numValue = parseInt(inputValue);

    // Check if input is valid
    if (inputValue === '' || isNaN(numValue) || numValue < 0 || numValue > 500) {
      // Invalid input - restore original value
      this.value = originalValue;
      volumeSlider.value = originalValue;
      sendVolumeChange(parseInt(originalValue), 'deferred'); // Restore display
      return;
    }

    const volume = numValue;
    this.value = volume; // Clean up the display
    volumeSlider.value = volume;

    // Apply the volume change now that editing is finished
    applyVolumeChange(volume);
  });

  // Volume input keypress event (Enter key - apply changes)
  volumeInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      this.blur(); // Trigger blur event for validation and application
    }
  });

  // Prevent invalid characters during typing
  volumeInput.addEventListener('keydown', function(e) {
    // Allow: backspace, delete, tab, escape, enter, arrows, home, end
    if ([8, 9, 27, 13, 46, 35, 36, 37, 38, 39, 40].indexOf(e.keyCode) !== -1 ||
        // Allow Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
        (e.keyCode === 65 && e.ctrlKey === true) ||
        (e.keyCode === 67 && e.ctrlKey === true) ||
        (e.keyCode === 86 && e.ctrlKey === true) ||
        (e.keyCode === 88 && e.ctrlKey === true)) {
      return;
    }
    // Ensure that it is a number and stop the keypress
    if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
      e.preventDefault();
    }
  });

  // Control button events - immediate application
  controlButtons.forEach(button => {
    button.addEventListener('click', function() {
      const volume = parseInt(this.dataset.volume);
      volumeSlider.value = volume;

      // If input is currently focused, update it and blur to apply changes
      if (isInputFocused) {
        volumeInput.value = volume;
        volumeInput.blur();
      } else {
        // Apply immediately for button clicks
        sendVolumeChange(volume, 'immediate');
      }
    });
  });

  // Volume increase/decrease button events with long press support
  let holdTimer = null;
  let holdInterval = null;
  let isHolding = false;

  function changeVolume(delta) {
    const currentVolume = parseInt(volumeInput.value);
    const validVolume = isNaN(currentVolume) ? 100 : currentVolume;
    const newVolume = Math.max(0, Math.min(500, validVolume + delta));
    volumeSlider.value = newVolume;
    volumeInput.value = newVolume;
    sendVolumeChange(newVolume, 'immediate');
  }

  function startHold(delta) {
    isHolding = false;
    // Initial change on mousedown
    changeVolume(delta);

    // Start holding after 500ms
    holdTimer = setTimeout(() => {
      isHolding = true;
      // Repeat every 100ms while holding
      holdInterval = setInterval(() => {
        changeVolume(delta);
      }, 100);
    }, 500);
  }

  function stopHold() {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (holdInterval) {
      clearInterval(holdInterval);
      holdInterval = null;
    }
    isHolding = false;
  }

  // Increase button
  volumeIncrease.addEventListener('mousedown', function(e) {
    e.preventDefault();
    startHold(1);
  });

  volumeIncrease.addEventListener('mouseup', stopHold);
  volumeIncrease.addEventListener('mouseleave', stopHold);

  // Decrease button
  volumeDecrease.addEventListener('mousedown', function(e) {
    e.preventDefault();
    startHold(-1);
  });

  volumeDecrease.addEventListener('mouseup', stopHold);
  volumeDecrease.addEventListener('mouseleave', stopHold);

  // Initialize with current slider value
  updateVolumeDisplay(parseInt(volumeSlider.value));
});