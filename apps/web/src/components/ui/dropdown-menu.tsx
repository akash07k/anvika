import * as React from 'react';
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';
import { CheckIcon, ChevronRightIcon } from 'lucide-react';

/**
 * Lets {@link DropdownMenuTrigger} open the menu the {@link DropdownMenu} root controls. It is set
 * only when the root manages its own (uncontrolled-style) open state; a caller-controlled root
 * leaves it `undefined` so the trigger defers entirely to the caller.
 */
const DropdownMenuOpenContext = React.createContext<((open: boolean) => void) | undefined>(
  undefined,
);

/**
 * Vendored shadcn DropdownMenu root over Radix. It keeps Radix's controlled/uncontrolled API:
 * pass `open`/`onOpenChange` for a controlled menu, or `defaultOpen` (or nothing) for an
 * uncontrolled one. In the uncontrolled case we promote the menu to internally-controlled so the
 * trigger can open it on a screen-reader Browse-mode click (see {@link DropdownMenuTrigger}); the
 * `open`/`onOpenChange` behavior callers observe is unchanged.
 *
 * @param props - Radix `DropdownMenu.Root` props.
 * @returns The dropdown-menu root.
 */
function DropdownMenu({
  open,
  defaultOpen,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  const isControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false);

  // Compose the caller's `onOpenChange` while keeping our internal state in sync. We call it as the
  // bound member `props.onOpenChange?.(next)` (not a stored reference) so oxlint's `unbound-method`
  // rule stays satisfied.
  const handleOpenChange = (next: boolean): void => {
    if (!isControlled) setInternalOpen(next);
    props.onOpenChange?.(next);
  };

  // A caller-controlled root must not be opened behind the caller's back, so the trigger setter is
  // only exposed when we own the state.
  const setOpen = React.useCallback((next: boolean) => {
    setInternalOpen(next);
  }, []);

  return (
    <DropdownMenuOpenContext.Provider value={isControlled ? undefined : setOpen}>
      <DropdownMenuPrimitive.Root
        data-slot="dropdown-menu"
        {...props}
        open={isControlled ? open : internalOpen}
        onOpenChange={handleOpenChange}
      />
    </DropdownMenuOpenContext.Provider>
  );
}

function DropdownMenuPortal({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
  return <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />;
}

/**
 * Vendored shadcn DropdownMenu trigger over Radix, with a screen-reader Browse-mode fix.
 *
 * WHY this open-on-AT-click handler exists (do not "simplify" it away): Radix's
 * `DropdownMenu.Trigger` toggles the menu on `pointerdown` (mouse) and `keydown` (Enter/Space/Arrow
 * with real keyboard focus), but NOT on a plain `click`. NVDA Browse mode and JAWS Virtual mode do
 * not move real focus onto the button and dispatch only a single synthesized `click` when the user
 * activates it - no `pointerdown`, no `keydown` - so Radix alone never opens and the user is forced
 * to switch to Focus mode every time. We detect that activation by "a `click` NOT preceded by a
 * `pointerdown` on the trigger" (tracked via {@link pointerDownRef}). This is `event.detail`-AGNOSTIC
 * on purpose: screen readers do not reliably synthesize `detail === 0`, so a `detail`-based check
 * misses real NVDA. A real mouse click always runs `pointerdown` first (Radix opens the menu there),
 * so its trailing click is ignored here - no double-toggle; keyboard Focus-mode is untouched (Radix's
 * `keydown` opens it). The handler is a no-op when the root is caller-controlled (`setOpen` is
 * `undefined`). See `docs/research/radix-dropdown-browse-mode-fix.md`.
 *
 * @param props - Radix `DropdownMenu.Trigger` props (caller `onClick`/`onPointerDown` are composed).
 * @returns The dropdown-menu trigger.
 */
function DropdownMenuTrigger({
  onClick,
  onPointerDown,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  const setOpen = React.useContext(DropdownMenuOpenContext);
  // True for the brief window between a real pointerdown on the trigger and its click, so the click
  // handler can tell a mouse click (pointerdown then click) from a keyboard/AT click (a bare click).
  const pointerDownRef = React.useRef(false);

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      onPointerDown?.(event);
      pointerDownRef.current = true;
      // Clear on the next frame so a pointerdown NOT followed by a click (drag-away) does not leave
      // the flag stuck and wrongly suppress a later assistive-technology click.
      requestAnimationFrame(() => {
        pointerDownRef.current = false;
      });
    },
    [onPointerDown],
  );

  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      // A click NOT preceded by a pointerdown is a keyboard/AT/Browse-mode activation; open the menu.
      // A real mouse click set the ref via its pointerdown (Radix already opened), so it is ignored.
      if (setOpen && !pointerDownRef.current) setOpen(true);
      pointerDownRef.current = false;
    },
    [onClick, setOpen],
  );

  return (
    <DropdownMenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      {...props}
    />
  );
}

function DropdownMenuContent({
  className,
  align = 'start',
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        align={align}
        className={cn(
          'z-50 max-h-(--radix-dropdown-menu-content-available-height) w-(--radix-dropdown-menu-trigger-width) min-w-32 origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:overflow-hidden data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuGroup({ ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

function DropdownMenuItem({
  className,
  inset,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean;
  variant?: 'default' | 'destructive';
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "group/dropdown-menu-item relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[variant=destructive]:*:[svg]:text-destructive",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuCheckboxItem({
  className,
  children,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem> & {
  inset?: boolean;
}) {
  // `checked` flows through `...props` rather than an explicit prop: destructuring it would widen it
  // to `CheckedState | undefined`, which our `exactOptionalPropertyTypes` config rejects on assignment.
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      className={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

function DropdownMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
  return <DropdownMenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />;
}

function DropdownMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem> & {
  inset?: boolean;
}) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      className={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & {
  inset?: boolean;
}) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        'px-1.5 py-1 text-xs font-medium text-muted-foreground data-inset:pl-7',
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
}

function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        'ml-auto text-xs tracking-widest text-muted-foreground group-focus/dropdown-menu-item:text-accent-foreground',
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSub({ ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
  return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />;
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & {
  inset?: boolean;
}) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7 data-open:bg-accent data-open:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto" />
    </DropdownMenuPrimitive.SubTrigger>
  );
}

function DropdownMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.SubContent
      data-slot="dropdown-menu-sub-content"
      className={cn(
        'z-50 min-w-[96px] origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
        className,
      )}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
};
