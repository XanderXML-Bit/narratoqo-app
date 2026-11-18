import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SiteFooter } from '../components/layout/SiteFooter';
import { AppPolicy } from './AppPolicy';
import deployment from '../../vercel.json';

describe('App policy destinations', () => {
  it('links Privacy to the app privacy section', () => {
    render(<SiteFooter />);
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy#privacy');
  });

  it('links Terms to the factual app-use section', () => {
    render(<SiteFooter />);
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/privacy#app-use');
  });

  it('serves the app-policy route on direct navigation', () => {
    expect(deployment.rewrites).toContainEqual({ source: '/privacy', destination: '/index.html' });
  });

  it('discloses browser storage and optional network processing without adding legal terms', () => {
    render(<MemoryRouter><AppPolicy /></MemoryRouter>);
    expect(screen.getByText(/This page covers the Narratoqo browser app/)).toBeInTheDocument();
    expect(screen.getByText(/Projects and generated audio.*IndexedDB/)).toBeInTheDocument();
    expect(screen.getByText(/Voice preferences.*localStorage/)).toBeInTheDocument();
    expect(screen.getByText(/Kokoro uses Cache Storage/)).toBeInTheDocument();
    expect(screen.getByText(/Piper uses the Origin Private File System/)).toBeInTheDocument();
    expect(screen.getByText(/Keys use.*sessionStorage/)).toBeInTheDocument();
    expect(screen.getByText(/Optional cloud voices send your narration text/)).toBeInTheDocument();
    expect(screen.getByText(/URL import sends the article URL through a public CORS proxy/)).toBeInTheDocument();
    expect(screen.getByText(/does not add separate legal terms/)).toBeInTheDocument();
    expect(document.querySelector('#privacy')).toBeInTheDocument();
    expect(document.querySelector('#app-use')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Narratoqo' })).toHaveAttribute('href', '/');
  });
});
