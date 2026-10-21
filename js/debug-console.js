// On-screen error log (shows JS / Firebase errors on devices without devtools)
const debugBox = document.getElementById('debug-console');
  
  function printErrorToScreen(msg) {
    debugBox.style.display = 'block'; // Unhides the box when an error hits
    const time = new Date().toLocaleTimeString();
    debugBox.innerHTML += `<div style="margin-top: 5px; border-bottom: 1px solid #555; padding-bottom: 5px;">[${time}] ${msg}</div>`;
  }

  // 1. Catch standard JavaScript crashes
  window.onerror = function(message, source, lineno, colno, error) {
    printErrorToScreen(`JS Crash: ${message} (Line: ${lineno})`);
    return false;
  };

  // 2. Catch Firebase/Database connection failures
  window.addEventListener('unhandledrejection', function(event) {
    let reason = event.reason ? (event.reason.message || event.reason) : "Unknown Promise Error";
    printErrorToScreen(`Database Error: ${reason}`);
  });

  // 3. Catch console.error logs
  const originalConsoleError = console.error;
  console.error = function(...args) {
    printErrorToScreen(`Console Error: ${args.join(' ')}`);
    originalConsoleError.apply(console, args);
  };
