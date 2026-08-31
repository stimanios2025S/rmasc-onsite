'use client';
import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';
import { PERFORMANCE_MOCK, CAUSES_RETARD_MOCK } from '@/data/mock-data';

export default function AnalyticsSection() {
  const [onglet, setOnglet] = useState<'performance' | 'causes'>('performance');

  return (
    <div className="bg-white rounded-2xl border border-[#E5E8F0] shadow-[0_2px_8px_rgba(0,0,0,0.06)] mt-6">
      {/* Onglets */}
      <div className="flex items-center border-b border-[#E5E8F0]">
        <button onClick={() => setOnglet('performance')}
          className={`px-6 py-4 text-sm font-medium border-b-2 transition ${onglet === 'performance' ? 'border-[#3B4BB9] text-[#3B4BB9]' : 'border-transparent text-[#6B7294] hover:text-[#1E2235]'}`}>
          Performance des equipes
        </button>
        <button onClick={() => setOnglet('causes')}
          className={`px-6 py-4 text-sm font-medium border-b-2 transition ${onglet === 'causes' ? 'border-[#3B4BB9] text-[#3B4BB9]' : 'border-transparent text-[#6B7294] hover:text-[#1E2235]'}`}>
          Causes de retard
        </button>
      </div>

      <div className="p-6">
        {onglet === 'performance' ? (
          <div style={{ height: 350 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={PERFORMANCE_MOCK} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E8F0" />
                <XAxis dataKey="equipeNom" tick={{ fontSize: 11, fill: '#6B7294' }} />
                <YAxis unit=" min" tick={{ fontSize: 11, fill: '#6B7294' }} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E5E8F0', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="dureeMoyenneMecanique" name="Mecanique (min)" fill="#2196F3" radius={[4, 4, 0, 0]} />
                <Bar dataKey="dureeMoyenneElectrique" name="Electrique (min)" fill="#FF9800" radius={[4, 4, 0, 0]} />
                <Bar dataKey="dureeMoyenneVerification" name="Verification (min)" fill="#4CAF50" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-12">
            <div style={{ width: 280, height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={CAUSES_RETARD_MOCK} cx="50%" cy="50%" innerRadius={60} outerRadius={120}
                    dataKey="pourcentage" nameKey="cause" label={({ cause, pourcentage }) => `${cause} ${pourcentage}%`}>
                    {CAUSES_RETARD_MOCK.map((e, i) => (
                      <Cell key={i} fill={e.couleur} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => `${value}%`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3">
              {CAUSES_RETARD_MOCK.map((c, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: c.couleur }} />
                  <span className="text-sm text-[#1E2235]">{c.cause}</span>
                  <span className="text-sm font-bold text-[#1E2235] ml-auto">{c.pourcentage}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
