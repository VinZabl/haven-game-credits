/**
 * Re-export from context so all consumers share the same member state.
 * Ensures prices (member/reseller discounts) update immediately on login without refresh.
 */
export { useMemberAuth } from '../context/MemberAuthContext';
