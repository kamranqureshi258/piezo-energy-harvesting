import React, { useState } from 'react';
import { Usb, X, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { ArduinoSerialHandler } from '../utils/serialHandler';

export default function SerialConnectionModal({ isOpen, onClose, onConnect, error }) {
  const [baudRate, setBaudRate] = useState('115200');
  const supported = ArduinoSerialHandler.isSupported();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-6 relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title */}
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400">
            <Usb className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-100">Connect Arduino Serial</h3>
            <p className="text-xs text-slate-400">USB COM Port (Web Serial API)</p>
          </div>
        </div>

        {/* Browser compatibility check */}
        {!supported ? (
          <div className="p-3.5 bg-rose-950/80 border border-rose-800 rounded-xl text-xs text-rose-300 space-y-1">
            <div className="flex items-center space-x-1.5 font-bold text-rose-200">
              <ShieldAlert className="w-4 h-4" />
              <span>Browser Not Supported</span>
            </div>
            <p>
              Web Serial API is only supported in Google Chrome, Microsoft Edge, and Opera. Please switch browsers or use the built-in Simulator.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Baud Rate Picker */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Baud Rate (BPS):
              </label>
              <select
                value={baudRate}
                onChange={(e) => setBaudRate(e.target.value)}
                className="w-full bg-slate-950 text-emerald-300 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="115200">115200 baud (Recommended standard)</option>
                <option value="9600">9600 baud</option>
                <option value="57600">57600 baud</option>
                <option value="19200">19200 baud</option>
              </select>
            </div>

            {/* Error banner if any */}
            {error && (
              <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-xl text-xs text-rose-300 flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Instructions */}
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-400 space-y-1.5">
              <p className="font-semibold text-slate-300">Quick Connection Steps:</p>
              <ol className="list-decimal list-inside space-y-1 text-slate-400">
                <li>Plug Arduino into your PC via USB cable.</li>
                <li>Flash the provided sketch using Arduino IDE.</li>
                <li>Click "Select Port & Connect" below and pick your COM port.</li>
              </ol>
            </div>

            {/* Actions */}
            <div className="flex items-center space-x-3 pt-2">
              <button
                onClick={() => onConnect(baudRate)}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-emerald-900/40 transition-all active:scale-95 flex items-center justify-center space-x-2"
              >
                <Usb className="w-4 h-4" />
                <span>Select Port & Connect</span>
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
