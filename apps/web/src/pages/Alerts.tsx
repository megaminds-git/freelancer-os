import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { Bell, Clock, Globe, Save, ToggleLeft, ToggleRight } from 'lucide-react';
import { alertsApi } from '../lib/api';
import { POPULAR_COUNTRIES } from '@freelancer-os/shared';
import clsx from 'clsx';
import { useState, useEffect } from 'react';

interface AlertFormData {
  countries: string[];
  activeHoursStart: number;
  activeHoursEnd: number;
  enabled: boolean;
}

export default function Alerts() {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);

  const { data: config, isLoading } = useQuery({
    queryKey: ['alerts-config'],
    queryFn: alertsApi.getConfig,
  });

  const { data: scheduleData } = useQuery({
    queryKey: ['alerts-schedule'],
    queryFn: alertsApi.getSchedule,
  });

  const saveMutation = useMutation({
    mutationFn: (data: AlertFormData) =>
      alertsApi.saveConfig({
        ...data,
        timezones: [],
        notificationChannels: ['browser'],
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts-config'] });
      qc.invalidateQueries({ queryKey: ['alerts-schedule'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const { control, handleSubmit, watch, setValue, reset } = useForm<AlertFormData>({
    defaultValues: {
      countries: [],
      activeHoursStart: 8,
      activeHoursEnd: 20,
      enabled: true,
    },
  });

  useEffect(() => {
    if (config) {
      reset({
        countries: config.countries ?? [],
        activeHoursStart: config.activeHoursStart ?? 8,
        activeHoursEnd: config.activeHoursEnd ?? 20,
        enabled: config.enabled ?? true,
      });
    }
  }, [config, reset]);

  const selectedCountries = watch('countries');
  const enabled = watch('enabled');
  const hoursStart = watch('activeHoursStart');
  const hoursEnd = watch('activeHoursEnd');

  function toggleCountry(country: string) {
    const current = selectedCountries ?? [];
    setValue(
      'countries',
      current.includes(country)
        ? current.filter((c) => c !== country)
        : [...current, country],
    );
  }

  function formatHour(h: number) {
    return h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
  }

  if (isLoading) {
    return <div className="p-8 text-center text-slate-400">Loading...</div>;
  }

  return (
    <div className="page-shell-tight">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark flex items-center gap-2">
          <Bell size={22} className="text-primary" /> Timezone Alerts
        </h1>
        <p className="text-slate-500 mt-0.5">
          Get notified when target markets are active and posting projects
        </p>
      </div>

      <form onSubmit={handleSubmit((d) => saveMutation.mutate(d))}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Country Selection */}
          <div className="lg:col-span-2 card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-dark flex items-center gap-2">
                <Globe size={16} className="text-primary" /> Target Markets
              </h2>
              <span className="badge badge-blue">
                {selectedCountries?.length ?? 0} selected
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {POPULAR_COUNTRIES.map((country) => {
                const isSelected = selectedCountries?.includes(country);
                return (
                  <button
                    key={country}
                    type="button"
                    onClick={() => toggleCountry(country)}
                    className={clsx(
                      'px-3 py-1.5 rounded-lg text-sm font-medium border transition-all',
                      isSelected
                        ? 'bg-primary text-white border-primary shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-primary/50 hover:text-primary',
                    )}
                  >
                    {country}
                  </button>
                );
              })}
            </div>

            {selectedCountries?.length === 0 && (
              <p className="text-xs text-slate-400 mt-3">
                Select the countries you typically bid on to get targeted alerts.
              </p>
            )}
          </div>

          {/* Settings Panel */}
          <div className="space-y-4">
            {/* Enable Toggle */}
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-dark text-sm">Alerts Enabled</p>
                  <p className="text-xs text-slate-400 mt-0.5">Receive notifications</p>
                </div>
                <button
                  type="button"
                  onClick={() => setValue('enabled', !enabled)}
                  className={clsx('transition-colors', enabled ? 'text-primary' : 'text-slate-300')}
                >
                  {enabled
                    ? <ToggleRight size={32} />
                    : <ToggleLeft size={32} />}
                </button>
              </div>
            </div>

            {/* Active Hours */}
            <div className="card p-4">
              <h3 className="font-medium text-dark text-sm mb-3 flex items-center gap-2">
                <Clock size={14} className="text-primary" /> Active Hours
              </h3>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>Start</span>
                    <span className="font-medium text-dark">{formatHour(hoursStart)}</span>
                  </div>
                  <Controller
                    name="activeHoursStart"
                    control={control}
                    render={({ field }) => (
                      <input
                        type="range"
                        min={0}
                        max={23}
                        value={field.value}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                        className="w-full accent-primary"
                      />
                    )}
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>End</span>
                    <span className="font-medium text-dark">{formatHour(hoursEnd)}</span>
                  </div>
                  <Controller
                    name="activeHoursEnd"
                    control={control}
                    render={({ field }) => (
                      <input
                        type="range"
                        min={0}
                        max={23}
                        value={field.value}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                        className="w-full accent-primary"
                      />
                    )}
                  />
                </div>
                <p className="text-xs text-slate-400">
                  You'll receive alerts between {formatHour(hoursStart)} – {formatHour(hoursEnd)} your local time
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={saveMutation.isPending}
              className={clsx(
                'btn w-full justify-center transition-all',
                saved ? 'bg-success text-white' : 'btn-primary',
              )}
            >
              <Save size={14} />
              {saved ? 'Saved!' : saveMutation.isPending ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </form>

      {/* Schedule Preview */}
      {scheduleData?.schedule?.length > 0 && (
        <div className="mt-6 card p-5">
          <h2 className="font-semibold text-dark mb-4">Alert Schedule</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {scheduleData.schedule.map((s: {
              country: string;
              timezone: string;
              currentTime: string;
              alertTime: string;
            }) => (
              <div key={s.country} className="bg-slate-50 rounded-xl p-3">
                <p className="font-medium text-dark text-sm">{s.country}</p>
                <p className="text-xs text-slate-400 mt-0.5">{s.timezone}</p>
                <div className="mt-2 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500">Now</p>
                    <p className="text-sm font-semibold text-dark">{s.currentTime}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Alert at</p>
                    <p className="text-sm font-semibold text-primary">{s.alertTime}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
