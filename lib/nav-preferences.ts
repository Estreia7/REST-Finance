/** Desktop navigation: the sidebar (the default) or the floating dock. */
export type NavMode = 'sidebar' | 'dock';

/** The dock's own look, independent of the app's theme. */
export type DockTheme = 'light' | 'dark';

export const isNavMode = (value: unknown): value is NavMode => value === 'sidebar' || value === 'dock';
export const isDockTheme = (value: unknown): value is DockTheme => value === 'light' || value === 'dark';
