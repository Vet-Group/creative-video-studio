'use client';
import { Component, type ReactNode } from 'react';

/**
 * Catches the Settings chunk failing to load (a tab opened before a deploy removed the old chunk, or a flaky network).
 * Shell sits above (app)/error.tsx, so without this the whole page would fall to global-error and lose typed form state.
 * It tries again each time the dialog opens, so every failed click says so.
 */
export class SettingsBoundary extends Component<{ open: boolean; onFail: () => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    this.props.onFail();
  }
  override componentDidUpdate(prev: { open: boolean }) {
    if (this.state.failed && this.props.open && !prev.open) this.setState({ failed: false });
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}
