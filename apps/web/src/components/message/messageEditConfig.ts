/**
 * Send-key configuration the inline message editor needs, threaded from the same settings that drive
 * the Composer (`settings.sendKeyMode` and `keymap.send`). When a list receives no `editConfig` the
 * inline edit affordance is disabled, so a surface without send-key context never offers Edit.
 */
export interface MessageEditConfig {
  /**
   * Which key submits the edit (tracks the settings schema). `modEnter` submits on the keymap `send`
   * binding and lets plain Enter newline; `enter` submits on plain Enter and lets Shift+Enter newline.
   */
  sendKeyMode: 'enter' | 'modEnter';
  /** The configured send binding (keymap `send`), used only in `modEnter` mode. */
  sendBinding: string;
}
