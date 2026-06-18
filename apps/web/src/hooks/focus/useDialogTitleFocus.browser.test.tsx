import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { expect, test } from 'vitest';

import { Dialog, DialogContent, DialogTitle } from '../../components/ui/dialog';
import { useDialogTitleFocus } from './useDialogTitleFocus';

function Harness() {
  const { titleRef, dialogProps } = useDialogTitleFocus();
  return (
    <Dialog open>
      <DialogContent aria-describedby={undefined} {...dialogProps}>
        <DialogTitle ref={titleRef} tabIndex={-1}>
          My dialog
        </DialogTitle>
        <button type="button">Some action</button>
      </DialogContent>
    </Dialog>
  );
}

test('moves initial focus to the dialog title on open', async () => {
  await render(<Harness />);
  await expect.element(page.getByRole('heading', { name: 'My dialog' })).toHaveFocus();
});
