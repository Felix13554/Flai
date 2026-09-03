import React, { useState } from 'react';
import { Send, Mail, Users, Calendar, Trash2, Eye, FileText, Plus, Edit, Save, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { supabase } from '../../utils/supabase';
import { NewsletterTemplate, NewsletterTemplateData } from '../../types';
import EditableContent from '../EditableContent';

const NewsletterManager: React.FC = () => {
  const { user } = useAuth();
  const { newsletterSubscribers, newsletters, newsletterTemplates, refreshNewsletters, refreshNewsletterSubscribers, refreshNewsletterTemplates } = useData();
  
  // Newsletter sending states
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [isSending, setIsSending] = useState(false);
  const [selectedNewsletter, setSelectedNewsletter] = useState<string | null>(null);
  
  // Tab management
  const [activeTab, setActiveTab] = useState<'send' | 'templates'>('send');
  
  // Template management states
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NewsletterTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState({
    name: '',
    subject: '',
    header: '',
    body: '',
    footer: '',
    primaryColor: '#3B82F6',
    secondaryColor: '#1F2937',
    backgroundColor: '#F9FAFB',
    textColor: '#111827'
  });

  const handleSendNewsletter = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim() || !content.trim()) {
      toast.error('Titel og indhold er påkrævet');
      return;
    }

    if (!user) {
      toast.error('Du skal være logget ind for at sende nyhedsbreve');
      return;
    }

    setIsSending(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error('Session udløbet. Log venligst ind igen.');
        return;
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-newsletter`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ title: title.trim(), content: content.trim() }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(data.message);
        setTitle('');
        setContent('');
        setSelectedTemplateId('');
        refreshNewsletters();
      } else {
        toast.error(data.error || 'Der opstod en fejl ved afsendelse af nyhedsbrev');
      }
    } catch (error) {
      console.error('Newsletter send error:', error);
      toast.error('Der opstod en fejl ved afsendelse. Prøv venligst igen.');
    } finally {
      setIsSending(false);
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    
    if (templateId) {
      const template = newsletterTemplates.find(t => t.id === templateId);
      if (template) {
        setTitle(template.template_data.subject);
        setContent(`${template.template_data.header}\n\n${template.template_data.body}\n\n${template.template_data.footer}`);
      }
    } else {
      setTitle('');
      setContent('');
    }
  };

  const handleDeleteSubscriber = async (subscriberId: string, email: string) => {
    if (!confirm(`Er du sikker på, at du vil fjerne ${email} fra nyhedsbrevet?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('newsletter_subscribers')
        .delete()
        .eq('id', subscriberId);

      if (error) throw error;

      toast.success('Abonnent fjernet');
      refreshNewsletterSubscribers();
    } catch (error) {
      console.error('Error deleting subscriber:', error);
      toast.error('Kunne ikke fjerne abonnent');
    }
  };

  const resetTemplateForm = () => {
    setTemplateForm({
      name: '',
      subject: '',
      header: '',
      body: '',
      footer: '',
      primaryColor: '#3B82F6',
      secondaryColor: '#1F2937',
      backgroundColor: '#F9FAFB',
      textColor: '#111827'
    });
  };

  const handleCreateTemplate = () => {
    setIsCreatingTemplate(true);
    setEditingTemplate(null);
    resetTemplateForm();
  };

  const handleEditTemplate = (template: NewsletterTemplate) => {
    setEditingTemplate(template);
    setIsCreatingTemplate(false);
    setTemplateForm({
      name: template.name,
      subject: template.template_data.subject,
      header: template.template_data.header,
      body: template.template_data.body,
      footer: template.template_data.footer,
      primaryColor: template.template_data.colors.primary,
      secondaryColor: template.template_data.colors.secondary,
      backgroundColor: template.template_data.colors.background,
      textColor: template.template_data.colors.text
    });
  };

  const handleSaveTemplate = async () => {
    if (!templateForm.name.trim()) {
      toast.error('Skabelon navn er påkrævet');
      return;
    }

    const templateData: NewsletterTemplateData = {
      subject: templateForm.subject,
      header: templateForm.header,
      body: templateForm.body,
      footer: templateForm.footer,
      colors: {
        primary: templateForm.primaryColor,
        secondary: templateForm.secondaryColor,
        background: templateForm.backgroundColor,
        text: templateForm.textColor
      }
    };

    try {
      if (editingTemplate) {
        // Update existing template
        const { error } = await supabase
          .from('newsletter_templates')
          .update({
            name: templateForm.name,
            template_data: templateData
          })
          .eq('id', editingTemplate.id);

        if (error) throw error;
        toast.success('Skabelon opdateret');
      } else {
        // Create new template
        const { error } = await supabase
          .from('newsletter_templates')
          .insert({
            name: templateForm.name,
            template_data: templateData
          });

        if (error) throw error;
        toast.success('Skabelon oprettet');
      }

      setIsCreatingTemplate(false);
      setEditingTemplate(null);
      resetTemplateForm();
      refreshNewsletterTemplates();
    } catch (error: any) {
      console.error('Error saving template:', error);
      if (error.code === '23505') {
        toast.error('En skabelon med dette navn eksisterer allerede');
      } else {
        toast.error('Kunne ikke gemme skabelon');
      }
    }
  };

  const handleDeleteTemplate = async (template: NewsletterTemplate) => {
    if (!confirm(`Er du sikker på, at du vil slette skabelonen "${template.name}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('newsletter_templates')
        .delete()
        .eq('id', template.id);

      if (error) throw error;

      toast.success('Skabelon slettet');
      refreshNewsletterTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
      toast.error('Kunne ikke slette skabelon');
    }
  };

  const handleCancelEdit = () => {
    setIsCreatingTemplate(false);
    setEditingTemplate(null);
    resetTemplateForm();
  };

  const selectedNewsletterData = newsletters.find(n => n.id === selectedNewsletter);

  return (
    <div className="space-y-8">
      <EditableContent
        contentKey="admin-newsletter-title"
        as="h2"
        className="text-2xl font-bold mb-6"
        fallback="Nyhedsbrev Administration"
      />

      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-neutral-700/20 rounded-lg p-1">
        <button
          onClick={() => setActiveTab('send')}
          className={`flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-md transition-colors ${
            activeTab === 'send'
              ? 'bg-primary text-white'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-600/50'
          }`}
        >
          <Send size={20} />
          <span><EditableContent contentKey="newsletter-manager-send-nyhedsbrev" fallback="Send Nyhedsbrev" /></span>
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-md transition-colors ${
            activeTab === 'templates'
              ? 'bg-primary text-white'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-600/50'
          }`}
        >
          <FileText size={20} />
          <span><EditableContent contentKey="newsletter-manager-administrer-skabeloner" fallback="Administrer Skabeloner" /></span>
        </button>
      </div>

      {activeTab === 'send' && (
        <>
          {/* Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-neutral-700/20 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <EditableContent
                    contentKey="admin-newsletter-subscribers-label"
                    as="p"
                    className="text-neutral-400 text-sm"
                    fallback="Samlet antal abonnenter"
                  />
                  <p className="text-2xl font-bold">{newsletterSubscribers.length}</p>
                </div>
                <Users className="text-primary" size={24} />
              </div>
            </div>

            <div className="bg-neutral-700/20 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <EditableContent
                    contentKey="admin-newsletter-sent-label"
                    as="p"
                    className="text-neutral-400 text-sm"
                    fallback="Sendte Nyhedsbreve"
                  />
                  <p className="text-2xl font-bold">{newsletters.length}</p>
                </div>
                <Mail className="text-primary" size={24} />
              </div>
            </div>

            <div className="bg-neutral-700/20 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <EditableContent
                    contentKey="admin-newsletter-last-sent-label"
                    as="p"
                    className="text-neutral-400 text-sm"
                    fallback="Sidst Sendt"
                  />
                  <p className="text-sm font-medium">
                    {newsletters.length > 0 
                      ? new Date(newsletters[0].sent_at).toLocaleDateString('da-DK')
                      : 'Aldrig'
                    }
                  </p>
                </div>
                <Calendar className="text-primary" size={24} />
              </div>
            </div>
          </div>

          {/* Send Newsletter Form */}
          <div className="bg-neutral-700/20 rounded-lg p-6">
            <EditableContent
              contentKey="admin-newsletter-send-title"
              as="h3"
              className="text-xl font-semibold mb-4"
              fallback="Send Nyt Nyhedsbrev"
            />
            
            <form onSubmit={handleSendNewsletter} className="space-y-4">
              {/* Template Selection */}
              <div>
                <EditableContent
                  contentKey="admin-newsletter-template-label"
                  as="label"
                  className="block text-sm font-medium mb-2"
                  fallback="Vælg Skabelon (valgfrit)"
                />
                <select
                  value={selectedTemplateId}
                  onChange={(e) => handleTemplateSelect(e.target.value)}
                  className="form-input w-full"
                  disabled={isSending}
                >
                  <option value=""><EditableContent contentKey="newsletter-manager-ingen-skabelon-start-fra-bunden" fallback="Ingen skabelon - start fra bunden" /></option>
                  {newsletterTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <EditableContent
                  contentKey="admin-newsletter-title-label"
                  as="label"
                  className="block text-sm font-medium mb-2"
                  fallback="Titel"
                />
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="form-input w-full"
                  placeholder="Indtast nyhedsbrev titel..."
                  required
                  disabled={isSending}
                />
              </div>
              
              <div>
                <EditableContent
                  contentKey="admin-newsletter-content-label"
                  as="label"
                  className="block text-sm font-medium mb-2"
                  fallback="Indhold"
                />
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="form-input w-full"
                  rows={8}
                  placeholder="Skriv dit nyhedsbrev indhold her..."
                  required
                  disabled={isSending}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <EditableContent
                  contentKey="admin-newsletter-recipients-info"
                  as="p"
                  className="text-sm text-neutral-400"
                  fallback={`Vil blive sendt til ${newsletterSubscribers.length} abonnenter`}
                />
                
                <button
                  type="submit"
                  disabled={isSending || newsletterSubscribers.length === 0}
                  className="btn-primary flex items-center space-x-2"
                >
                  <Send size={20} />
                  <EditableContent
                    contentKey="admin-newsletter-send-button"
                    as="span"
                    fallback={isSending ? "Sender..." : "Send Nyhedsbrev"}
                  />
                </button>
              </div>
            </form>
          </div>

          {/* Newsletter History */}
          <div className="bg-neutral-700/20 rounded-lg p-6">
            <EditableContent
              contentKey="admin-newsletter-history-title"
              as="h3"
              className="text-xl font-semibold mb-4"
              fallback="Nyhedsbrev Historik"
            />
            
            {newsletters.length === 0 ? (
              <EditableContent
                contentKey="admin-newsletter-no-history"
                as="p"
                className="text-neutral-400 text-center py-8"
                fallback="Ingen nyhedsbreve sendt endnu"
              />
            ) : (
              <div className="space-y-4">
                {newsletters.map((newsletter) => (
                  <div key={newsletter.id} className="border border-neutral-600 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold">{newsletter.title}</h4>
                        <p className="text-sm text-neutral-400">
                          <EditableContent contentKey="newsletter-manager-sendt" fallback="Sendt" />{new Date(newsletter.sent_at).toLocaleDateString('da-DK')} <EditableContent contentKey="newsletter-manager-kl" fallback="kl." />{new Date(newsletter.sent_at).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <button
                        onClick={() => setSelectedNewsletter(selectedNewsletter === newsletter.id ? null : newsletter.id)}
                        className="btn-secondary flex items-center space-x-2"
                      >
                        <Eye size={16} />
                        <span>{selectedNewsletter === newsletter.id ? 'Skjul' : 'Vis'}</span>
                      </button>
                    </div>
                    
                    {selectedNewsletter === newsletter.id && selectedNewsletterData && (
                      <div className="mt-4 pt-4 border-t border-neutral-600">
                        <div className="bg-neutral-800 rounded p-4">
                          <div className="whitespace-pre-wrap text-sm">
                            {selectedNewsletterData.content}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Subscribers List */}
          <div className="bg-neutral-700/20 rounded-lg p-6">
            <EditableContent
              contentKey="admin-newsletter-subscribers-title"
              as="h3"
              className="text-xl font-semibold mb-4"
              fallback="Abonnenter"
            />
            
            {newsletterSubscribers.length === 0 ? (
              <EditableContent
                contentKey="admin-newsletter-no-subscribers"
                as="p"
                className="text-neutral-400 text-center py-8"
                fallback="Ingen abonnenter endnu"
              />
            ) : (
              <div className="space-y-2">
                {newsletterSubscribers.map((subscriber) => (
                  <div key={subscriber.id} className="flex items-center justify-between py-2 px-4 bg-neutral-800 rounded">
                    <div>
                      <p className="font-medium">{subscriber.email}</p>
                      <p className="text-sm text-neutral-400">
                        <EditableContent contentKey="newsletter-manager-tilmeldt" fallback="Tilmeldt" />{new Date(subscriber.created_at).toLocaleDateString('da-DK')}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteSubscriber(subscriber.id, subscriber.email)}
                      className="text-error hover:text-error/80 p-2"
                      title="Fjern abonnent"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'templates' && (
        <div className="space-y-6">
          {/* Template Management Header */}
          <div className="flex items-center justify-between">
            <EditableContent
              contentKey="admin-newsletter-templates-title"
              as="h3"
              className="text-xl font-semibold"
              fallback="Nyhedsbrev Skabeloner"
            />
            
            {!isCreatingTemplate && !editingTemplate && (
              <button
                onClick={handleCreateTemplate}
                className="btn-primary flex items-center space-x-2"
              >
                <Plus size={20} />
                <span><EditableContent contentKey="newsletter-manager-opret-skabelon" fallback="Opret Skabelon" /></span>
              </button>
            )}
          </div>

          {/* Template Form */}
          {(isCreatingTemplate || editingTemplate) && (
            <div className="bg-neutral-700/20 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-semibold">
                  {editingTemplate ? 'Rediger Skabelon' : 'Opret Ny Skabelon'}
                </h4>
                <div className="flex space-x-2">
                  <button
                    onClick={handleSaveTemplate}
                    className="btn-primary flex items-center space-x-2"
                  >
                    <Save size={16} />
                    <span><EditableContent contentKey="newsletter-manager-gem" fallback="Gem" /></span>
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="btn-secondary flex items-center space-x-2"
                  >
                    <X size={16} />
                    <span><EditableContent contentKey="newsletter-manager-annuller" fallback="Annuller" /></span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Template Content */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2"><EditableContent contentKey="newsletter-manager-skabelon-navn" fallback="Skabelon Navn" /></label>
                    <input
                      type="text"
                      value={templateForm.name}
                      onChange={(e) => setTemplateForm(prev => ({ ...prev, name: e.target.value }))}
                      className="form-input w-full"
                      placeholder="Indtast skabelon navn..."
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2"><EditableContent contentKey="newsletter-manager-emne" fallback="Emne" /></label>
                    <input
                      type="text"
                      value={templateForm.subject}
                      onChange={(e) => setTemplateForm(prev => ({ ...prev, subject: e.target.value }))}
                      className="form-input w-full"
                      placeholder="Nyhedsbrev emne..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2"><EditableContent contentKey="newsletter-manager-overskrift" fallback="Overskrift" /></label>
                    <input
                      type="text"
                      value={templateForm.header}
                      onChange={(e) => setTemplateForm(prev => ({ ...prev, header: e.target.value }))}
                      className="form-input w-full"
                      placeholder="Nyhedsbrev overskrift..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2"><EditableContent contentKey="newsletter-manager-indhold" fallback="Indhold" /></label>
                    <textarea
                      value={templateForm.body}
                      onChange={(e) => setTemplateForm(prev => ({ ...prev, body: e.target.value }))}
                      className="form-input w-full"
                      rows={6}
                      placeholder="Hovedindhold af nyhedsbrevet..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2"><EditableContent contentKey="newsletter-manager-bundtekst" fallback="Bundtekst" /></label>
                    <textarea
                      value={templateForm.footer}
                      onChange={(e) => setTemplateForm(prev => ({ ...prev, footer: e.target.value }))}
                      className="form-input w-full"
                      rows={3}
                      placeholder="Bundtekst eller signatur..."
                    />
                  </div>
                </div>

                {/* Color Settings */}
                <div className="space-y-4">
                  <h5 className="font-medium"><EditableContent contentKey="newsletter-manager-farveindstillinger" fallback="Farveindstillinger" /></h5>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2"><EditableContent contentKey="newsletter-manager-primaer-farve" fallback="Primær Farve" /></label>
                      <div className="flex items-center space-x-2">
                        <input
                          type="color"
                          value={templateForm.primaryColor}
                          onChange={(e) => setTemplateForm(prev => ({ ...prev, primaryColor: e.target.value }))}
                          className="w-12 h-10 rounded border border-neutral-600"
                        />
                        <input
                          type="text"
                          value={templateForm.primaryColor}
                          onChange={(e) => setTemplateForm(prev => ({ ...prev, primaryColor: e.target.value }))}
                          className="form-input flex-1"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2"><EditableContent contentKey="newsletter-manager-sekundaer-farve" fallback="Sekundær Farve" /></label>
                      <div className="flex items-center space-x-2">
                        <input
                          type="color"
                          value={templateForm.secondaryColor}
                          onChange={(e) => setTemplateForm(prev => ({ ...prev, secondaryColor: e.target.value }))}
                          className="w-12 h-10 rounded border border-neutral-600"
                        />
                        <input
                          type="text"
                          value={templateForm.secondaryColor}
                          onChange={(e) => setTemplateForm(prev => ({ ...prev, secondaryColor: e.target.value }))}
                          className="form-input flex-1"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2"><EditableContent contentKey="newsletter-manager-baggrund" fallback="Baggrund" /></label>
                      <div className="flex items-center space-x-2">
                        <input
                          type="color"
                          value={templateForm.backgroundColor}
                          onChange={(e) => setTemplateForm(prev => ({ ...prev, backgroundColor: e.target.value }))}
                          className="w-12 h-10 rounded border border-neutral-600"
                        />
                        <input
                          type="text"
                          value={templateForm.backgroundColor}
                          onChange={(e) => setTemplateForm(prev => ({ ...prev, backgroundColor: e.target.value }))}
                          className="form-input flex-1"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2"><EditableContent contentKey="newsletter-manager-tekst-farve" fallback="Tekst Farve" /></label>
                      <div className="flex items-center space-x-2">
                        <input
                          type="color"
                          value={templateForm.textColor}
                          onChange={(e) => setTemplateForm(prev => ({ ...prev, textColor: e.target.value }))}
                          className="w-12 h-10 rounded border border-neutral-600"
                        />
                        <input
                          type="text"
                          value={templateForm.textColor}
                          onChange={(e) => setTemplateForm(prev => ({ ...prev, textColor: e.target.value }))}
                          className="form-input flex-1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Preview */}
                  <div className="mt-6">
                    <h5 className="font-medium mb-2"><EditableContent contentKey="newsletter-manager-forhaandsvisning" fallback="Forhåndsvisning" /></h5>
                    <div 
                      className="border rounded-lg p-4 text-sm"
                      style={{ 
                        backgroundColor: templateForm.backgroundColor,
                        color: templateForm.textColor,
                        borderColor: templateForm.secondaryColor
                      }}
                    >
                      <div 
                        className="font-bold text-lg mb-2"
                        style={{ color: templateForm.primaryColor }}
                      >
                        {templateForm.header || 'Overskrift'}
                      </div>
                      <div className="mb-4 whitespace-pre-wrap">
                        {templateForm.body || 'Nyhedsbrev indhold vil blive vist her...'}
                      </div>
                      <div 
                        className="text-xs border-t pt-2"
                        style={{ 
                          borderColor: templateForm.secondaryColor,
                          color: templateForm.secondaryColor
                        }}
                      >
                        {templateForm.footer || 'Bundtekst'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Templates List */}
          {!isCreatingTemplate && !editingTemplate && (
            <div className="bg-neutral-700/20 rounded-lg p-6">
              {newsletterTemplates.length === 0 ? (
                <EditableContent
                  contentKey="admin-newsletter-no-templates"
                  as="p"
                  className="text-neutral-400 text-center py-8"
                  fallback="Ingen skabeloner oprettet endnu"
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {newsletterTemplates.map((template) => (
                    <div key={template.id} className="border border-neutral-600 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <h4 className="font-semibold">{template.name}</h4>
                        <div className="flex space-x-1">
                          <button
                            onClick={() => handleEditTemplate(template)}
                            className="text-primary hover:text-primary/80 p-1"
                            title="Rediger skabelon"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteTemplate(template)}
                            className="text-error hover:text-error/80 p-1"
                            title="Slet skabelon"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      
                      <div className="text-sm text-neutral-400 mb-3">
                        <p><strong><EditableContent contentKey="newsletter-manager-emne-2" fallback="Emne:" /></strong> {template.template_data.subject}</p>
                        <p><strong><EditableContent contentKey="newsletter-manager-oprettet" fallback="Oprettet:" /></strong> {new Date(template.created_at).toLocaleDateString('da-DK')}</p>
                      </div>
                      
                      {/* Mini Preview */}
                      <div 
                        className="text-xs p-2 rounded border"
                        style={{ 
                          backgroundColor: template.template_data.colors.background,
                          color: template.template_data.colors.text,
                          borderColor: template.template_data.colors.secondary
                        }}
                      >
                        <div 
                          className="font-bold mb-1"
                          style={{ color: template.template_data.colors.primary }}
                        >
                          {template.template_data.header}
                        </div>
                        <div className="truncate">
                          {template.template_data.body.substring(0, 50)}...
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NewsletterManager;