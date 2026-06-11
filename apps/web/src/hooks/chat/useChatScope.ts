import { useEffect } from 'react';
import { useHotkeysContext } from 'react-hotkeys-hook';

/**
 * Enable the `chat` hotkey scope while the calling component is mounted and release it on unmount
 * so chat shortcuts are live only on the conversation surface and inert on other routes.
 */
export function useChatScope(): void {
  const { enableScope, disableScope } = useHotkeysContext();
  useEffect(() => {
    enableScope('chat');
    return () => disableScope('chat');
  }, [enableScope, disableScope]);
}
