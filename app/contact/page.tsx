'use client';

import { useState } from 'react';
import { Mail, Phone, MapPin, Send, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { translateError } from '@/lib/error-messages';

export default function ContactPage() {
  const { t, language } = useLanguage();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  /** Holds a translation key, resolved at display. See `lib/error-messages.ts`. */
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    // TODO: send the email for real
    setTimeout(() => {
      setIsLoading(false);
      setIsSubmitted(true);
      setFormData({ name: '', email: '', subject: '', message: '' });
    }, 1000);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const subjectOptions = [
    { value: 'support',     labelKey: 'contactPage.subjectSupport' },
    { value: 'sales',       labelKey: 'contactPage.subjectSales' },
    { value: 'partnership', labelKey: 'contactPage.subjectPartnership' },
    { value: 'other',       labelKey: 'contactPage.subjectOther' },
  ];

  return (
    <main className="flex-1 min-h-screen pt-16 md:pt-20">
      <div className="container py-12 md:py-20">
        <div className="max-w-6xl mx-auto space-y-16">
          {/* Hero Section */}
          <section className="text-center space-y-6">
            <h1 className="text-4xl md:text-6xl font-bold">
              {t('contactPage.heroTitleLead')}{' '}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                {t('contactPage.heroTitleAccent')}
              </span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              {t('contactPage.heroSubtitle')}
            </p>
          </section>

          <div className="grid md:grid-cols-2 gap-12">
            {/* Contact Form */}
            <section className="card p-8 space-y-6">
              <h2 className="text-2xl font-bold">{t('contactPage.formTitle')}</h2>

              {error && (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-danger/10 border border-danger/30 text-danger">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <p className="text-sm">{translateError(language, error)}</p>
                </div>
              )}

              {isSubmitted ? (
                <div className="flex flex-col items-center gap-4 p-8 text-center">
                  <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-success" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold">{t('contactPage.sentTitle')}</h3>
                    <p className="text-muted-foreground">
                      {t('contactPage.sentBody')}
                    </p>
                  </div>
                  <button
                    onClick={() => setIsSubmitted(false)}
                    className="text-primary hover:text-accent transition-colors text-sm font-medium"
                  >
                    {t('contactPage.sendAnother')}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label htmlFor="name" className="text-sm font-semibold text-foreground">
                      {t('contactPage.nameLabel')}
                    </label>
                    <input
                      id="name"
                      name="name"
                      type="text"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      className="w-full px-4 py-3 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                      placeholder={t('contactPage.namePlaceholder')}
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-semibold text-foreground">
                      {t('contactPage.emailLabel')}
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      className="w-full px-4 py-3 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                      placeholder={t('contactPage.emailPlaceholder')}
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="subject" className="text-sm font-semibold text-foreground">
                      {t('contactPage.subjectLabel')}
                    </label>
                    <select
                      id="subject"
                      name="subject"
                      value={formData.subject}
                      onChange={handleChange}
                      required
                      className="w-full px-4 py-3 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                    >
                      <option value="">{t('contactPage.subjectPlaceholder')}</option>
                      {subjectOptions.map(({ value, labelKey }) => (
                        <option key={value} value={value}>{t(labelKey)}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="message" className="text-sm font-semibold text-foreground">
                      {t('contactPage.messageLabel')}
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      value={formData.message}
                      onChange={handleChange}
                      required
                      rows={6}
                      className="w-full px-4 py-3 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all resize-none"
                      placeholder={t('contactPage.messagePlaceholder')}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full cta-button flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
                        <span>{t('contactPage.sending')}</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        <span>{t('contactPage.send')}</span>
                      </>
                    )}
                  </button>
                </form>
              )}
            </section>

            {/* Contact Information */}
            <section className="space-y-8">
              <div className="card p-8 space-y-6">
                <h2 className="text-2xl font-bold">{t('contactPage.infoTitle')}</h2>
                <p className="text-muted-foreground">
                  {t('contactPage.infoSubtitle')}
                </p>
              </div>

              <div className="space-y-6">
                <div className="card p-6 space-y-4 group hover:border-primary/50 transition-all">
                  <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Phone className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-2">{t('contactPage.phoneTitle')}</h3>
                    <div className="space-y-1 text-muted-foreground">
                      <p>
                        <a href="tel:+1-555-234-5678" className="text-primary hover:text-accent transition-colors">
                          +1 (555) 234-5678
                        </a>
                        {' '}— {t('contactPage.phoneSales')}
                      </p>
                      <p>
                        <a href="tel:+1-555-234-5679" className="text-primary hover:text-accent transition-colors">
                          +1 (555) 234-5679
                        </a>
                        {' '}— {t('contactPage.phoneSupport')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="card p-6 space-y-4 group hover:border-primary/50 transition-all">
                  <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Mail className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-2">{t('contactPage.emailTitle')}</h3>
                    <div className="space-y-1 text-muted-foreground">
                      <p>
                        <a href="mailto:hello@restfinance.com" className="text-primary hover:text-accent transition-colors break-all">
                          hello@restfinance.com
                        </a>
                        {' '}— {t('contactPage.emailGeneral')}
                      </p>
                      <p>
                        <a href="mailto:support@restfinance.com" className="text-primary hover:text-accent transition-colors break-all">
                          support@restfinance.com
                        </a>
                        {' '}— {t('contactPage.emailSupport')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="card p-6 space-y-4 group hover:border-primary/50 transition-all">
                  <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <MapPin className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-2">{t('contactPage.officeTitle')}</h3>
                    {/* A postal address reads the same in both languages. */}
                    <p className="text-muted-foreground leading-relaxed">
                      1247 Market Street<br />
                      Suite 450<br />
                      San Francisco, CA 94102<br />
                      United States
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
