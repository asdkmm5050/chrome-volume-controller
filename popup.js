document.addEventListener('DOMContentLoaded', function() {
  const volumeSlider = document.getElementById('volumeSlider');
  const volumeInput = document.getElementById('volumeInput');
  const controlButtons = document.querySelectorAll('.control-button');

  let currentTabId = null;
  let currentTabUrl = null;

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

  // Load volume from storage (fallback)
  function loadSavedVolumeFromStorage() {
    const hostname = new URL(currentTabUrl).hostname;
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

  // Send volume change to content script
  function sendVolumeChange(volume) {
    if (!currentTabId) return;

    chrome.tabs.sendMessage(currentTabId, {
      action: 'setVolume',
      volume: volume / 100
    }).catch(error => {
      // Ignore connection errors - content script may not be ready yet
      console.log('Content script not ready:', error);
    });

    // Save volume for current tab (by hostname)
    if (currentTabUrl) {
      const hostname = new URL(currentTabUrl).hostname;
      const storageKey = `volume_url_${hostname}`;
      
      chrome.storage.local.set({
        [storageKey]: volume
      }, function() {
        if (chrome.runtime.lastError) {
          console.error('Failed to save volume:', chrome.runtime.lastError);
        }
      });
    }

    updateVolumeDisplay(volume);
  }

  // Validate and constrain volume value
  function validateVolume(value) {
    const num = parseInt(value);
    if (isNaN(num)) return 100;
    return Math.max(0, Math.min(500, num));
  }

  // Slider change event
  volumeSlider.addEventListener('input', function() {
    const volume = parseInt(this.value);
    sendVolumeChange(volume);
  });

  // Store original value when input starts
  let originalValue = volumeInput.value;

  volumeInput.addEventListener('focus', function() {
    originalValue = this.value;
  });

  // Volume input blur event (when user clicks away)
  volumeInput.addEventListener('blur', function() {
    const inputValue = this.value.trim();
    
    // Check if input is valid
    if (inputValue === '' || isNaN(inputValue) || inputValue < 0 || inputValue > 500) {
      // Invalid input - restore original value
      this.value = originalValue;
      return;
    }
    
    const volume = parseInt(inputValue);
    this.value = volume; // Clean up the display
    volumeSlider.value = volume;
    sendVolumeChange(volume);
  });

  // Volume input keypress event (Enter key)
  volumeInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      this.blur(); // Trigger blur event for validation
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

  // Control button events
  controlButtons.forEach(button => {
    button.addEventListener('click', function() {
      const volume = parseInt(this.dataset.volume);
      volumeSlider.value = volume;
      sendVolumeChange(volume);
    });
  });

  // Initialize with current slider value
  updateVolumeDisplay(parseInt(volumeSlider.value));
});