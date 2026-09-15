import React from 'react';
export const user = { authenticatedUserId: 'fixture-owner' };
export const useUserStore = selector => selector(user);
useUserStore.getState = () => user;
export function DashboardLayout({ children }) { return <><div style={{ padding: 12, background: '#fef3c7', color: '#78350f', textAlign: 'center' }}>ISOLATED UI TEST · synthetic events · no broker connection</div>{children}</>; }
export default function Link(props) { return <a {...props} />; }
