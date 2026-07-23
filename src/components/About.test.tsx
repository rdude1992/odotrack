import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import About from './About';

describe('About.tsx', () => {
  it('renders the default app name and description', () => {
    render(<About />);
    
    // Check if the default app name is rendered
    expect(screen.getByText('ODOTRACK')).toBeInTheDocument();
    
    // Check if the description is rendered
    expect(screen.getByText(/Offline-first vehicle mileage/i)).toBeInTheDocument();
    
    // Check if default version is rendered
    expect(screen.getByText('0.0.0')).toBeInTheDocument();
  });

  it('renders custom props correctly', () => {
    render(
      <About 
        appName="CustomApp" 
        version="1.2.3" 
        developerName="TestDev" 
        description="Custom description text" 
      />
    );
    
    expect(screen.getByText('CustomApp')).toBeInTheDocument();
    expect(screen.getByText('1.2.3')).toBeInTheDocument();
    expect(screen.getByText(/TestDev/i)).toBeInTheDocument();
    expect(screen.getByText('Custom description text')).toBeInTheDocument();
  });
});
