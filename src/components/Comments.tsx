import React, { useState, useEffect } from 'react';
import { MessageCircle, Send, Trash2, User } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

interface Comment {
  id: string;
  image_id: string;
  user_id: string | null;
  author_name: string;
  content: string;
  created_at: string;
  is_admin: boolean;
}

interface CommentsProps {
  imageId: string;
}

const Comments: React.FC<CommentsProps> = ({ imageId }) => {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [showComments, setShowComments] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (showComments) {
      loadComments();
    }
  }, [imageId, showComments]);

  const loadComments = async () => {
    try {
      const { data, error } = await supabase
        .from('portfolio_comments')
        .select('*')
        .eq('image_id', imageId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setComments(data || []);
    } catch (err) {
      console.error('Error loading comments:', err);
    }
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newComment.trim()) {
      toast.error('Kommentar kan ikke være tom');
      return;
    }

    if (!user && !authorName.trim()) {
      toast.error('Indtast dit navn');
      return;
    }

    setLoading(true);

    try {
      const commentData = {
        image_id: imageId,
        user_id: user?.id || null,
        author_name: user ? user.email?.split('@')[0] || 'Bruger' : authorName,
        content: newComment,
        is_admin: user ? true : false
      };

      const { error } = await supabase
        .from('portfolio_comments')
        .insert([commentData]);

      if (error) throw error;

      toast.success('Kommentar tilføjet');
      setNewComment('');
      if (!user) setAuthorName('');
      await loadComments();
    } catch (err) {
      console.error('Error adding comment:', err);
      toast.error('Kunne ikke tilføje kommentar');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm('Slet denne kommentar?')) return;

    try {
      const { error } = await supabase
        .from('portfolio_comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;

      toast.success('Kommentar slettet');
      await loadComments();
    } catch (err) {
      console.error('Error deleting comment:', err);
      toast.error('Kunne ikke slette kommentar');
    }
  };

  return (
    <div className="mt-2">
      <button
        onClick={() => setShowComments(!showComments)}
        className="flex items-center space-x-2 text-neutral-400 hover:text-white transition-colors text-sm"
      >
        <MessageCircle size={16} />
        <span>{comments.length} {comments.length === 1 ? 'kommentar' : 'kommentarer'}</span>
      </button>

      {showComments && (
        <div className="mt-4 space-y-4">
          {/* Comment form */}
          <form onSubmit={handleSubmitComment} className="space-y-2">
            {!user && (
              <input
                type="text"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="Dit navn"
                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm focus:outline-none focus:border-primary"
                required
              />
            )}
            <div className="flex space-x-2">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Skriv en kommentar..."
                className="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm focus:outline-none focus:border-primary"
                required
              />
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-primary hover:bg-primary/80 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center space-x-1"
              >
                <Send size={16} />
              </button>
            </div>
          </form>

          {/* Comments list */}
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {comments.length === 0 ? (
              <p className="text-neutral-500 text-sm text-center py-4">Ingen kommentarer endnu</p>
            ) : (
              comments.map((comment) => (
                <div key={comment.id} className="bg-neutral-800/50 rounded-lg p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2 mb-2">
                      <User size={14} className="text-neutral-400" />
                      <span className="text-sm font-medium">
                        {comment.author_name}
                        {comment.is_admin && (
                          <span className="ml-2 text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">
                            Admin
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-neutral-500">
                        {new Date(comment.created_at).toLocaleDateString('da-DK', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                    {user && comment.is_admin && (
                      <button
                        onClick={() => handleDeleteComment(comment.id)}
                        className="text-error hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-neutral-300">{comment.content}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Comments;