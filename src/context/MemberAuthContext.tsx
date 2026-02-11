import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Member, CreateMemberData, LoginMemberData } from '../types';

const hashPassword = async (password: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  const passwordHash = await hashPassword(password);
  return passwordHash === hash;
};

type MemberAuthValue = {
  currentMember: Member | null;
  loading: boolean;
  register: (data: CreateMemberData) => Promise<{ success: boolean; error?: string; member?: Member }>;
  login: (data: LoginMemberData) => Promise<{ success: boolean; error?: string; member?: Member }>;
  logout: () => void;
  isReseller: () => boolean;
  isAuthenticated: boolean;
};

const MemberAuthContext = createContext<MemberAuthValue | null>(null);

export const MemberAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentMember, setCurrentMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    const memberId = localStorage.getItem('member_id');
    if (memberId) {
      try {
        const { data, error } = await supabase
          .from('members')
          .select('*')
          .eq('id', memberId)
          .eq('status', 'active')
          .single();

        if (!error && data) {
          setCurrentMember(data as Member);
        } else {
          localStorage.removeItem('member_id');
          setCurrentMember(null);
        }
      } catch (err) {
        console.error('Error checking auth:', err);
        localStorage.removeItem('member_id');
        setCurrentMember(null);
      }
    } else {
      setCurrentMember(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    checkAuth();
    const handleStorageChange = () => checkAuth();
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('memberAuthUpdate', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('memberAuthUpdate', handleStorageChange);
    };
  }, [checkAuth]);

  const register = useCallback(async (data: CreateMemberData): Promise<{ success: boolean; error?: string; member?: Member }> => {
    try {
      const { data: existingEmail } = await supabase
        .from('members')
        .select('id')
        .eq('email', data.email)
        .single();
      if (existingEmail) return { success: false, error: 'Email already registered' };

      const { data: existingUsername } = await supabase
        .from('members')
        .select('id')
        .eq('username', data.username)
        .single();
      if (existingUsername) return { success: false, error: 'Username already taken' };

      const passwordHash = await hashPassword(data.password);
      const { data: newMember, error } = await supabase
        .from('members')
        .insert({
          username: data.username,
          email: data.email,
          mobile_no: data.mobile_no || null,
          password_hash: passwordHash,
          level: 1,
          status: 'active',
          user_type: 'end_user'
        })
        .select()
        .single();

      if (error) return { success: false, error: error.message };
      if (newMember) {
        localStorage.setItem('member_id', newMember.id);
        setCurrentMember(newMember as Member);
        window.dispatchEvent(new CustomEvent('memberAuthUpdate'));
        return { success: true, member: newMember as Member };
      }
      return { success: false, error: 'Registration failed' };
    } catch (err) {
      console.error('Registration error:', err);
      return { success: false, error: 'An error occurred during registration' };
    }
  }, []);

  const login = useCallback(async (data: LoginMemberData): Promise<{ success: boolean; error?: string; member?: Member }> => {
    try {
      const { data: member, error } = await supabase
        .from('members')
        .select('*')
        .eq('email', data.email)
        .single();

      if (error || !member) return { success: false, error: 'Invalid email or password' };
      if (member.status !== 'active') return { success: false, error: 'Account is inactive' };

      const isValid = await verifyPassword(data.password, member.password_hash);
      if (!isValid) return { success: false, error: 'Invalid email or password' };

      localStorage.setItem('member_id', member.id);
      setCurrentMember(member as Member);
      window.dispatchEvent(new CustomEvent('memberAuthUpdate'));
      return { success: true, member: member as Member };
    } catch (err) {
      console.error('Login error:', err);
      return { success: false, error: 'An error occurred during login' };
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('member_id');
    setCurrentMember(null);
  }, []);

  const isReseller = useCallback(() => currentMember?.user_type === 'reseller', [currentMember?.user_type]);

  const value: MemberAuthValue = {
    currentMember,
    loading,
    register,
    login,
    logout,
    isReseller,
    isAuthenticated: !!currentMember
  };

  return (
    <MemberAuthContext.Provider value={value}>
      {children}
    </MemberAuthContext.Provider>
  );
};

export function useMemberAuth(): MemberAuthValue {
  const ctx = useContext(MemberAuthContext);
  if (ctx == null) {
    throw new Error('useMemberAuth must be used within MemberAuthProvider');
  }
  return ctx;
}
