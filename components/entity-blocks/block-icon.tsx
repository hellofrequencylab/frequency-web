'use client'

import {
  Activity, Anchor, AtSign, Award, Bell, Bike, Book, BookOpen, Bookmark, Brush, Building, Cake, Calendar,
  CalendarHeart, Camera, Car, ChartBar, ChartPie, Check, CircleCheck, Clock, Cloud, Coffee, Compass,
  CreditCard, Crown, Diamond, DollarSign, Download, Dumbbell, Eye, Feather, Filter, Flag, Flame, Flower,
  Gem, Gift, Globe, Handshake, Hash, Headphones, Heart, HeartHandshake, House, Image, Infinity, Key, Leaf,
  Lightbulb, Link, Lock, Mail, Map, MapPin, MessageCircle, Mic, Moon, Mountain, Music, Palette, PartyPopper,
  Pause, Pencil, Percent, Phone, Plane, Play, Puzzle, Quote, Rocket, Sailboat, Search, Send, Settings, Share2,
  Shield, ShoppingBag, ShoppingCart, Smile, Sparkles, Star, Store, Sun, Tag, Target, ThumbsUp, Ticket,
  TreePine, TrendingUp, Trophy, Upload, User, Users, Utensils, Video, Wand2, Waves, Wine, Wrench, Zap,
  type LucideIcon,
} from 'lucide-react'
import { isLucideIconName } from '@/lib/entity-blocks/icon-tokens'

// THE BLOCK ICON RESOLVER (email overhaul, 2026). A feature / card item stores a short `icon` TOKEN that is
// EITHER a curated Lucide name (kebab-case) OR an emoji character. This client component turns that token
// into the right node: a drawn Lucide icon when the token is one of the curated names, else the token printed
// as text (an emoji glyph, or a legacy free-text token — back-compat). The curated NAME set is the single
// source of truth in lib/entity-blocks/icon-tokens.ts; the map below mirrors it (a missing entry only
// degrades an icon to its printed text, never breaks). Semantic tokens for color (currentColor via the
// caller's text color); voice canon on any copy.

/** kebab-case Lucide token → its component. Keys MUST match LUCIDE_ICON_NAMES (icon-tokens.ts). */
const ICON_MAP: Record<string, LucideIcon> = {
  star: Star, heart: Heart, 'heart-handshake': HeartHandshake, sparkles: Sparkles, calendar: Calendar,
  'calendar-heart': CalendarHeart, clock: Clock, 'map-pin': MapPin, map: Map, compass: Compass, globe: Globe,
  users: Users, user: User, handshake: Handshake, 'message-circle': MessageCircle, mail: Mail, phone: Phone,
  send: Send, bell: Bell, gift: Gift, 'party-popper': PartyPopper, cake: Cake, coffee: Coffee, wine: Wine,
  utensils: Utensils, music: Music, headphones: Headphones, mic: Mic, camera: Camera, image: Image,
  video: Video, play: Play, pause: Pause, 'book-open': BookOpen, book: Book, bookmark: Bookmark,
  pencil: Pencil, feather: Feather, quote: Quote, lightbulb: Lightbulb, check: Check, 'circle-check': CircleCheck,
  award: Award, trophy: Trophy, target: Target, flag: Flag, rocket: Rocket, zap: Zap, flame: Flame, sun: Sun,
  moon: Moon, cloud: Cloud, leaf: Leaf, flower: Flower, 'tree-pine': TreePine, mountain: Mountain, waves: Waves,
  house: House, building: Building, store: Store, 'shopping-bag': ShoppingBag, 'shopping-cart': ShoppingCart,
  'credit-card': CreditCard, 'dollar-sign': DollarSign, tag: Tag, ticket: Ticket, percent: Percent,
  'trending-up': TrendingUp, 'chart-bar': ChartBar, 'chart-pie': ChartPie, activity: Activity, settings: Settings,
  wrench: Wrench, shield: Shield, lock: Lock, key: Key, search: Search, filter: Filter, link: Link,
  'share-2': Share2, download: Download, upload: Upload, 'thumbs-up': ThumbsUp, smile: Smile, eye: Eye,
  palette: Palette, brush: Brush, puzzle: Puzzle, crown: Crown, gem: Gem, diamond: Diamond, 'wand-2': Wand2,
  dumbbell: Dumbbell, bike: Bike, plane: Plane, car: Car, sailboat: Sailboat, anchor: Anchor, infinity: Infinity,
  'at-sign': AtSign, hash: Hash,
}

/** Render a stored icon token: a curated Lucide icon (drawn at `size` px, inheriting the caller's text
 *  color), or the token itself printed as text (an emoji). Empty token renders nothing. */
export function BlockIcon({
  name,
  size = 24,
  className,
}: {
  name: string
  size?: number
  className?: string
}) {
  if (!name) return null
  if (isLucideIconName(name)) {
    const Cmp = ICON_MAP[name]
    if (Cmp) return <Cmp size={size} className={className} aria-hidden />
  }
  return (
    <span className={className} style={{ fontSize: size, lineHeight: 1 }} aria-hidden>
      {name}
    </span>
  )
}
