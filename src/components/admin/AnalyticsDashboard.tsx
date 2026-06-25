import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  Calendar, 
  DollarSign, 
  Users, 
  Star,
  BarChart3,
  PieChart,
  Activity
} from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { useBookings } from '../../hooks/useBookings';
import EditableContent from '../EditableContent';
import { format, subDays, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { da } from 'date-fns/locale';

const AnalyticsDashboard: React.FC = () => {
  const { products, ratings } = useData();
  const { bookings } = useBookings();
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  // Filter bookings based on time range
  const filteredBookings = useMemo(() => {
    if (timeRange === 'all') return bookings;
    
    const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
    const cutoffDate = subDays(new Date(), days);
    
    return bookings.filter(booking => 
      new Date(booking.created_at) >= cutoffDate
    );
  }, [bookings, timeRange]);

  // Calculate analytics data
  const analytics = useMemo(() => {
    const totalRevenue = filteredBookings
      .filter(b => b.payment_status === 'paid')
      .reduce((sum, b) => sum + (b.price || 0), 0);

    const totalBookings = filteredBookings.length;
    const completedBookings = filteredBookings.filter(b => b.is_completed).length;
    const conversionRate = totalBookings > 0 ? (completedBookings / totalBookings) * 100 : 0;

    // Revenue by product
    const revenueByProduct = products.map(product => {
      const productBookings = filteredBookings.filter(b => 
        b.product_id === product.id && b.payment_status === 'paid'
      );
      const revenue = productBookings.reduce((sum, b) => sum + (b.price || 0), 0);
      return {
        name: product.name,
        revenue,
        bookings: productBookings.length
      };
    });

    // Daily revenue for chart
    const dailyRevenue = [];
    const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
    
    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const dayBookings = filteredBookings.filter(b => 
        format(new Date(b.created_at), 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd') &&
        b.payment_status === 'paid'
      );
      const dayRevenue = dayBookings.reduce((sum, b) => sum + (b.price || 0), 0);
      
      dailyRevenue.push({
        date: format(date, 'dd/MM'),
        revenue: dayRevenue,
        bookings: dayBookings.length
      });
    }

    // Payment method distribution
    const paymentMethods = filteredBookings
      .filter(b => b.payment_status === 'paid')
      .reduce((acc, booking) => {
        const method = booking.payment_method || 'unknown';
        acc[method] = (acc[method] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    // Average rating
    const averageRating = ratings.length > 0 
      ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length 
      : 0;

    return {
      totalRevenue,
      totalBookings,
      completedBookings,
      conversionRate,
      revenueByProduct,
      dailyRevenue,
      paymentMethods,
      averageRating
    };
  }, [filteredBookings, products, ratings, timeRange]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <EditableContent
          contentKey="admin-analytics-title"
          as="h2"
          className="text-2xl font-bold"
          fallback="Analyser og Statistikker"
        />
        
        <div className="flex space-x-2">
          {[
            { value: '7d', label: '7 dage' },
            { value: '30d', label: '30 dage' },
            { value: '90d', label: '90 dage' },
            { value: 'all', label: 'Alle' }
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => setTimeRange(option.value as any)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                timeRange === option.value
                  ? 'bg-primary text-white'
                  : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-neutral-700/20 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <EditableContent
                contentKey="admin-analytics-revenue-label"
                as="p"
                className="text-neutral-400 text-sm"
                fallback="Omsætning"
              />
              <p className="text-2xl font-bold text-primary">
                {analytics.totalRevenue.toLocaleString()} kr
              </p>
            </div>
            <DollarSign className="text-primary" size={24} />
          </div>
        </div>

        <div className="bg-neutral-700/20 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <EditableContent
                contentKey="admin-analytics-bookings-label"
                as="p"
                className="text-neutral-400 text-sm"
                fallback="Bookinger"
              />
              <p className="text-2xl font-bold">{analytics.totalBookings}</p>
            </div>
            <Calendar className="text-primary" size={24} />
          </div>
        </div>

        <div className="bg-neutral-700/20 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <EditableContent
                contentKey="admin-analytics-conversion-label"
                as="p"
                className="text-neutral-400 text-sm"
                fallback="Konverteringsrate"
              />
              <p className="text-2xl font-bold text-success">
                {analytics.conversionRate.toFixed(1)}%
              </p>
            </div>
            <TrendingUp className="text-success" size={24} />
          </div>
        </div>

        <div className="bg-neutral-700/20 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <EditableContent
                contentKey="admin-analytics-rating-label"
                as="p"
                className="text-neutral-400 text-sm"
                fallback="Gennemsnitsrating"
              />
              <p className="text-2xl font-bold text-warning">
                {analytics.averageRating.toFixed(1)}
              </p>
            </div>
            <Star className="text-warning" size={24} />
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Daily Revenue Chart */}
        <div className="bg-neutral-700/20 rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <EditableContent
              contentKey="admin-analytics-daily-revenue-title"
              as="h3"
              className="text-lg font-semibold"
              fallback="Daglig Omsætning"
            />
            <BarChart3 className="text-primary" size={20} />
          </div>
          
          <div className="space-y-3">
            {analytics.dailyRevenue.slice(-7).map((day, index) => (
              <div key={index} className="flex items-center justify-between">
                <span className="text-sm text-neutral-400">{day.date}</span>
                <div className="flex items-center space-x-3">
                  <div className="w-32 bg-neutral-600 rounded-full h-2">
                    <div 
                      className="bg-primary h-2 rounded-full"
                      style={{ 
                        width: `${Math.max(5, (day.revenue / Math.max(...analytics.dailyRevenue.map(d => d.revenue))) * 100)}%` 
                      }}
                    />
                  </div>
                  <span className="text-sm font-medium w-20 text-right">
                    {day.revenue.toLocaleString()} kr
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Product Performance */}
        <div className="bg-neutral-700/20 rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <EditableContent
              contentKey="admin-analytics-product-performance-title"
              as="h3"
              className="text-lg font-semibold"
              fallback="Produktpræstation"
            />
            <PieChart className="text-primary" size={20} />
          </div>
          
          <div className="space-y-4">
            {analytics.revenueByProduct
              .sort((a, b) => b.revenue - a.revenue)
              .map((product, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{product.name}</span>
                    <span className="text-sm text-neutral-400">
                      {product.revenue.toLocaleString()} kr
                    </span>
                  </div>
                  <div className="w-full bg-neutral-600 rounded-full h-2">
                    <div 
                      className="bg-primary h-2 rounded-full"
                      style={{ 
                        width: `${Math.max(5, (product.revenue / Math.max(...analytics.revenueByProduct.map(p => p.revenue))) * 100)}%` 
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-neutral-400">
                    <span>{product.bookings} bookinger</span>
                    <span>
                      {product.bookings > 0 ? (product.revenue / product.bookings).toFixed(0) : 0} kr/booking
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Payment Methods */}
      <div className="bg-neutral-700/20 rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <EditableContent
            contentKey="admin-analytics-payment-methods-title"
            as="h3"
            className="text-lg font-semibold"
            fallback="Betalingsmetoder"
          />
          <Activity className="text-primary" size={20} />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(analytics.paymentMethods).map(([method, count]) => (
            <div key={method} className="bg-neutral-600/20 rounded-lg p-4">
              <div className="text-center">
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-sm text-neutral-400 capitalize">
                  {method === 'card' ? 'Kort' : 
                   method === 'invoice' ? 'Faktura' : 
                   method}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="bg-neutral-700/20 rounded-lg p-6">
        <EditableContent
          contentKey="admin-analytics-summary-title"
          as="h3"
          className="text-lg font-semibold mb-4"
          fallback="Sammendrag"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <EditableContent
              contentKey="admin-analytics-summary-performance"
              as="h4"
              className="font-medium mb-2"
              fallback="Præstation"
            />
            <ul className="space-y-1 text-sm text-neutral-400">
              <li>• {analytics.completedBookings} af {analytics.totalBookings} bookinger gennemført</li>
              <li>• Gennemsnitlig ordreværdi: {analytics.totalBookings > 0 ? (analytics.totalRevenue / analytics.totalBookings).toFixed(0) : 0} kr</li>
              <li>• {ratings.length} kundeudtalelser med {analytics.averageRating.toFixed(1)} stjerner</li>
            </ul>
          </div>
          <div>
            <EditableContent
              contentKey="admin-analytics-summary-trends"
              as="h4"
              className="font-medium mb-2"
              fallback="Tendenser"
            />
            <ul className="space-y-1 text-sm text-neutral-400">
              <li>• Mest populære produkt: {analytics.revenueByProduct[0]?.name || 'N/A'}</li>
              <li>• Højeste omsætningsdag: {analytics.dailyRevenue.reduce((max, day) => day.revenue > max.revenue ? day : max, analytics.dailyRevenue[0])?.date || 'N/A'}</li>
              <li>• Konverteringsrate: {analytics.conversionRate.toFixed(1)}%</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;