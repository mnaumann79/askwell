/**
 * The public surface of the loader package.
 *
 * The bundle that a customer's website loads is built from `main.ts`; this
 * module is what the app imports (types only) and what the tests use.
 */

export {
  configUrl,
  loadSettings,
  panelUrl,
  readPublicKey,
  type WidgetAnimation,
  type WidgetPosition,
  type WidgetSettings,
} from "./config";
export {
  handleWidgetMessage,
  init,
  mountWidget,
  type WidgetMessageEvent,
  type WidgetView,
} from "./loader";
export {
  isWidgetMessage,
  WIDGET_CLOSE,
  WIDGET_OPEN,
  WIDGET_READY,
  WIDGET_RESIZE,
  WIDGET_UNREAD,
  type WidgetMessage,
} from "./protocol";
