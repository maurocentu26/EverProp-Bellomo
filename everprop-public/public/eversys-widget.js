/*
 * Eversys chat widget loader. Usage on any site allowed for the widget:
 *   <script src="https://PANEL_HOST/eversys-widget.js" data-widget-id="UUID" data-title="Chateá con Bellomo" data-color="#1f2937" async></script>
 * It only injects a button and an iframe pointing to /widget/{id}; no data leaves the iframe.
 */
(function () {
  // currentScript is null when a framework loader injects the tag late; fall back to the marker attribute.
  var script = document.currentScript || document.querySelector("script[data-widget-id][src*='eversys-widget.js']");
  if (!script || window.__eversysWidget) return;
  var widgetId = script.getAttribute("data-widget-id") || "";
  if (!/^[0-9a-f-]{36}$/i.test(widgetId)) return;
  window.__eversysWidget = true;
  var origin = new URL(script.src).origin;
  var title = script.getAttribute("data-title") || "Chateá con nosotros";
  var color = script.getAttribute("data-color") || "";
  if (!/^#[0-9a-f]{6}$/i.test(color)) color = "#2563eb";

  var button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", title);
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", "eversys-widget-frame");
  button.textContent = "💬";
  button.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483000;width:56px;height:56px;border-radius:9999px;border:0;background:" + color + ";color:#fff;font-size:24px;box-shadow:0 8px 24px rgba(0,0,0,.2);cursor:pointer";

  var frame = document.createElement("iframe");
  frame.id = "eversys-widget-frame";
  frame.title = title;
  frame.src = origin + "/widget/" + widgetId + "?title=" + encodeURIComponent(title);
  frame.style.cssText = "position:fixed;right:20px;bottom:88px;z-index:2147483000;width:min(380px,calc(100vw - 40px));height:min(560px,calc(100vh - 120px));border:0;border-radius:16px;box-shadow:0 12px 32px rgba(0,0,0,.25);display:none;background:#fff";

  function toggle(open) {
    frame.style.display = open ? "block" : "none";
    button.setAttribute("aria-expanded", String(open));
    if (open) frame.focus(); else button.focus();
  }
  button.addEventListener("click", function () { toggle(frame.style.display === "none"); });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && frame.style.display !== "none") toggle(false);
  });
  document.body.appendChild(frame);
  document.body.appendChild(button);
})();
