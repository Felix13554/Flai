import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase';
import { Product } from '../types';
import toast from 'react-hot-toast';

export const useProducts = () => {
  const { user, loading: authLoading } = useAuth();
  const { products, isProductsLoaded, refreshProducts } = useData();

  const addProduct = async (newProduct: Omit<Product, 'id' | 'created_at'>) => {
    try {
      const { data, error: insertError } = await supabase
        .from('products')
        .insert([newProduct])
        .select()
        .throwOnError()
        .single();

      if (insertError) {
        throw insertError;
      }

      // Refresh products data
      await refreshProducts();
      
      return data;
    } catch (err: any) {
      console.error('Error adding product:', err);
      toast.error('Kunne ikke tilføje produkt. Prøv venligst igen.');
      throw err;
    }
  };

  const updateProduct = async (id: number, updates: Partial<Omit<Product, 'id' | 'created_at'>>) => {
    try {
      const { error: updateError } = await supabase
        .from('products')
        .update(updates)
        .eq('id', id)
        .throwOnError();

      if (updateError) {
        throw updateError;
      }

      // Refresh products data
      await refreshProducts();
    } catch (err: any) {
      console.error('Error updating product:', err);
      toast.error('Kunne ikke opdatere produkt. Prøv venligst igen.');
      throw err;
    }
  };

  const deleteProduct = async (id: number) => {
    try {
      const { error: deleteError } = await supabase
        .from('products')
        .delete()
        .eq('id', id)
        .throwOnError();

      if (deleteError) {
        throw deleteError;
      }

      // Refresh products data
      await refreshProducts();
    } catch (err: any) {
      console.error('Error deleting product:', err);
      toast.error('Kunne ikke slette produkt. Prøv venligst igen.');
      throw err;
    }
  };

  return {
    products,
    loading: !isProductsLoaded,
    error: null,
    fetchProducts: refreshProducts,
    addProduct,
    updateProduct,
    deleteProduct
  };
};