// src/components/common/Panel.jsx
import React from 'react';
import './Panel.css';

export default function Panel({ 
  title, 
  subtitle, 
  children, 
  className = '', 
  headerActions = null 
}) {
  return (
    <div className={`panel ${className}`}>
      {(title || subtitle || headerActions) && (
        <div className="panel-header">
          <div className="panel-header-left">
            {title && <h3 className="panel-title">{title}</h3>}
            {subtitle && <p className="panel-subtitle">{subtitle}</p>}
          </div>
          {headerActions && (
            <div className="panel-header-actions">{headerActions}</div>
          )}
        </div>
      )}
      <div className="panel-body">
        {children}
      </div>
    </div>
  );
}