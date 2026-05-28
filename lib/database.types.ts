export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          category: Database["public"]["Enums"]["achievement_category"]
          created_at: string
          criteria: Json
          description: string
          icon: string
          id: string
          is_secret: boolean
          name: string
          slug: string
          sort_order: number
          tier: Database["public"]["Enums"]["achievement_tier"]
          zaps_reward: number
        }
        Insert: {
          category: Database["public"]["Enums"]["achievement_category"]
          created_at?: string
          criteria?: Json
          description: string
          icon?: string
          id?: string
          is_secret?: boolean
          name: string
          slug: string
          sort_order?: number
          tier?: Database["public"]["Enums"]["achievement_tier"]
          zaps_reward?: number
        }
        Update: {
          category?: Database["public"]["Enums"]["achievement_category"]
          created_at?: string
          criteria?: Json
          description?: string
          icon?: string
          id?: string
          is_secret?: boolean
          name?: string
          slug?: string
          sort_order?: number
          tier?: Database["public"]["Enums"]["achievement_tier"]
          zaps_reward?: number
        }
        Relationships: []
      }
      challenge_progress: {
        Row: {
          challenge_id: string
          completed_at: string | null
          created_at: string
          current: number
          id: string
          profile_id: string
        }
        Insert: {
          challenge_id: string
          completed_at?: string | null
          created_at?: string
          current?: number
          id?: string
          profile_id: string
        }
        Update: {
          challenge_id?: string
          completed_at?: string | null
          created_at?: string
          current?: number
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_progress_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "season_challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_progress_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_memberships: {
        Row: {
          channel_id: string
          id: string
          joined_at: string | null
          profile_id: string
          status: string
        }
        Insert: {
          channel_id: string
          id?: string
          joined_at?: string | null
          profile_id: string
          status?: string
        }
        Update: {
          channel_id?: string
          id?: string
          joined_at?: string | null
          profile_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_memberships_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          created_at: string | null
          creator_id: string | null
          creator_role: Database["public"]["Enums"]["community_role"]
          description: string | null
          event_date: string | null
          id: string
          is_public: boolean
          member_cap: number | null
          name: string
          scope: Database["public"]["Enums"]["channel_scope_type"]
          scope_id: string
          type: Database["public"]["Enums"]["channel_content_type"]
        }
        Insert: {
          created_at?: string | null
          creator_id?: string | null
          creator_role: Database["public"]["Enums"]["community_role"]
          description?: string | null
          event_date?: string | null
          id?: string
          is_public?: boolean
          member_cap?: number | null
          name: string
          scope: Database["public"]["Enums"]["channel_scope_type"]
          scope_id: string
          type?: Database["public"]["Enums"]["channel_content_type"]
        }
        Update: {
          created_at?: string | null
          creator_id?: string | null
          creator_role?: Database["public"]["Enums"]["community_role"]
          description?: string | null
          event_date?: string | null
          id?: string
          is_public?: boolean
          member_cap?: number | null
          name?: string
          scope?: Database["public"]["Enums"]["channel_scope_type"]
          scope_id?: string
          type?: Database["public"]["Enums"]["channel_content_type"]
        }
        Relationships: [
          {
            foreignKeyName: "channels_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      circles: {
        Row: {
          about: string | null
          city: string | null
          created_at: string | null
          host_id: string | null
          hub_id: string | null
          id: string
          latitude: number | null
          longitude: number | null
          member_cap: number
          member_count: number
          name: string
          neighborhood: string | null
          slug: string
          status: Database["public"]["Enums"]["group_status"]
          timezone: string | null
          topical_channel_id: string | null
          type: Database["public"]["Enums"]["circle_type"]
        }
        Insert: {
          about?: string | null
          city?: string | null
          created_at?: string | null
          host_id?: string | null
          hub_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          member_cap?: number
          member_count?: number
          name: string
          neighborhood?: string | null
          slug: string
          status?: Database["public"]["Enums"]["group_status"]
          timezone?: string | null
          topical_channel_id?: string | null
          type?: Database["public"]["Enums"]["circle_type"]
        }
        Update: {
          about?: string | null
          city?: string | null
          created_at?: string | null
          host_id?: string | null
          hub_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          member_cap?: number
          member_count?: number
          name?: string
          neighborhood?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["group_status"]
          timezone?: string | null
          topical_channel_id?: string | null
          type?: Database["public"]["Enums"]["circle_type"]
        }
        Relationships: [
          {
            foreignKeyName: "circles_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circles_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circles_topical_channel_id_fkey"
            columns: ["topical_channel_id"]
            isOneToOne: false
            referencedRelation: "topical_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          joined_at: string
          last_read_at: string | null
          profile_id: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string
          last_read_at?: string | null
          profile_id: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string
          last_read_at?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_completions: {
        Row: {
          completed_at: string | null
          id: string
          profile_id: string
          task_id: string | null
          verified_by: string | null
          zaps_earned: number
        }
        Insert: {
          completed_at?: string | null
          id?: string
          profile_id: string
          task_id?: string | null
          verified_by?: string | null
          zaps_earned: number
        }
        Update: {
          completed_at?: string | null
          id?: string
          profile_id?: string
          task_id?: string | null
          verified_by?: string | null
          zaps_earned?: number
        }
        Relationships: [
          {
            foreignKeyName: "crew_completions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_completions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "crew_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_completions_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_tasks: {
        Row: {
          created_at: string | null
          id: string
          is_repeatable: boolean | null
          name: string
          requires_verification: boolean | null
          task_type: string
          zaps_value: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_repeatable?: boolean | null
          name: string
          requires_verification?: boolean | null
          task_type: string
          zaps_value?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_repeatable?: boolean | null
          name?: string
          requires_verification?: boolean | null
          task_type?: string
          zaps_value?: number | null
        }
        Relationships: []
      }
      dispatch_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          dispatch_id: string
          id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          dispatch_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          dispatch_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_comments_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "dispatches"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_likes: {
        Row: {
          created_at: string
          dispatch_id: string
          id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          dispatch_id: string
          id?: string
          profile_id: string
        }
        Update: {
          created_at?: string
          dispatch_id?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_likes_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "dispatches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_likes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_poll_options: {
        Row: {
          created_at: string | null
          dispatch_id: string
          id: string
          label: string
          position: number
        }
        Insert: {
          created_at?: string | null
          dispatch_id: string
          id?: string
          label: string
          position?: number
        }
        Update: {
          created_at?: string | null
          dispatch_id?: string
          id?: string
          label?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_poll_options_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "dispatches"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_poll_votes: {
        Row: {
          created_at: string | null
          id: string
          option_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          option_id: string
          profile_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          option_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_poll_votes_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "dispatch_poll_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_poll_votes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatches: {
        Row: {
          audience_id: string
          audience_scope: string
          author_id: string
          body: string
          created_at: string
          dispatch_type: string
          excerpt: string | null
          hidden_at: string | null
          hidden_by: string | null
          id: string
          linked_task_id: string | null
          published_at: string | null
          scheduled_for: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          audience_id: string
          audience_scope: string
          author_id: string
          body: string
          created_at?: string
          dispatch_type?: string
          excerpt?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          linked_task_id?: string | null
          published_at?: string | null
          scheduled_for?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          audience_id?: string
          audience_scope?: string
          author_id?: string
          body?: string
          created_at?: string
          dispatch_type?: string
          excerpt?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          linked_task_id?: string | null
          published_at?: string | null
          scheduled_for?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatches_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatches_hidden_by_fkey"
            columns: ["hidden_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatches_linked_task_id_fkey"
            columns: ["linked_task_id"]
            isOneToOne: false
            referencedRelation: "crew_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      event_rsvps: {
        Row: {
          created_at: string | null
          event_id: string
          id: string
          profile_id: string
          reminder_24h_sent_at: string | null
          reminder_2h_sent_at: string | null
          status: string
        }
        Insert: {
          created_at?: string | null
          event_id: string
          id?: string
          profile_id: string
          reminder_24h_sent_at?: string | null
          reminder_2h_sent_at?: string | null
          status: string
        }
        Update: {
          created_at?: string | null
          event_id?: string
          id?: string
          profile_id?: string
          reminder_24h_sent_at?: string | null
          reminder_2h_sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_rsvps_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string | null
          description: string | null
          ends_at: string | null
          host_id: string | null
          id: string
          is_cancelled: boolean | null
          location: string | null
          mux_playback_id: string | null
          mux_stream_id: string | null
          parent_event_id: string | null
          recurrence_type: string
          recurrence_until: string | null
          scope_id: string
          scope_type: string
          slug: string
          starts_at: string
          title: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          ends_at?: string | null
          host_id?: string | null
          id?: string
          is_cancelled?: boolean | null
          location?: string | null
          mux_playback_id?: string | null
          mux_stream_id?: string | null
          parent_event_id?: string | null
          recurrence_type?: string
          recurrence_until?: string | null
          scope_id: string
          scope_type: string
          slug: string
          starts_at: string
          title: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          ends_at?: string | null
          host_id?: string | null
          id?: string
          is_cancelled?: boolean | null
          location?: string | null
          mux_playback_id?: string | null
          mux_stream_id?: string | null
          parent_event_id?: string | null
          recurrence_type?: string
          recurrence_until?: string | null
          scope_id?: string
          scope_type?: string
          slug?: string
          starts_at?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_parent_event_id_fkey"
            columns: ["parent_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          id: string
          requested_at: string
          requested_by: string
          responded_at: string | null
          status: string
          user_a_id: string
          user_b_id: string
        }
        Insert: {
          id?: string
          requested_at?: string
          requested_by: string
          responded_at?: string | null
          status?: string
          user_a_id: string
          user_b_id: string
        }
        Update: {
          id?: string
          requested_at?: string
          requested_by?: string
          responded_at?: string | null
          status?: string
          user_a_id?: string
          user_b_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_user_a_id_fkey"
            columns: ["user_a_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_user_b_id_fkey"
            columns: ["user_b_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gem_config: {
        Row: {
          action_type: string
          daily_cap: number | null
          description: string
          gems_amount: number
          id: string
          is_active: boolean
        }
        Insert: {
          action_type: string
          daily_cap?: number | null
          description: string
          gems_amount?: number
          id?: string
          is_active?: boolean
        }
        Update: {
          action_type?: string
          daily_cap?: number | null
          description?: string
          gems_amount?: number
          id?: string
          is_active?: boolean
        }
        Relationships: []
      }
      gem_transactions: {
        Row: {
          action_type: string
          amount: number
          created_at: string
          id: string
          metadata: Json | null
          profile_id: string
        }
        Insert: {
          action_type: string
          amount: number
          created_at?: string
          id?: string
          metadata?: Json | null
          profile_id: string
        }
        Update: {
          action_type?: string
          amount?: number
          created_at?: string
          id?: string
          metadata?: Json | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gem_transactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hubs: {
        Row: {
          created_at: string | null
          guide_id: string | null
          id: string
          name: string
          nexus_id: string | null
          slug: string
          status: Database["public"]["Enums"]["group_status"]
        }
        Insert: {
          created_at?: string | null
          guide_id?: string | null
          id?: string
          name: string
          nexus_id?: string | null
          slug: string
          status?: Database["public"]["Enums"]["group_status"]
        }
        Update: {
          created_at?: string | null
          guide_id?: string | null
          id?: string
          name?: string
          nexus_id?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["group_status"]
        }
        Relationships: [
          {
            foreignKeyName: "hubs_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hubs_nexus_id_fkey"
            columns: ["nexus_id"]
            isOneToOne: false
            referencedRelation: "nexuses"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_links: {
        Row: {
          circle_id: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number
          token: string
          used_count: number
        }
        Insert: {
          circle_id: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number
          token: string
          used_count?: number
        }
        Update: {
          circle_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number
          token?: string
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "invite_links_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          circle_id: string
          id: string
          joined_at: string | null
          lifecycle_day1_sent: boolean
          lifecycle_day3_sent: boolean
          lifecycle_day7_sent: boolean
          profile_id: string
          status: Database["public"]["Enums"]["membership_status"]
          volunteer_role: Database["public"]["Enums"]["community_role"] | null
        }
        Insert: {
          circle_id: string
          id?: string
          joined_at?: string | null
          lifecycle_day1_sent?: boolean
          lifecycle_day3_sent?: boolean
          lifecycle_day7_sent?: boolean
          profile_id: string
          status?: Database["public"]["Enums"]["membership_status"]
          volunteer_role?: Database["public"]["Enums"]["community_role"] | null
        }
        Update: {
          circle_id?: string
          id?: string
          joined_at?: string | null
          lifecycle_day1_sent?: boolean
          lifecycle_day3_sent?: boolean
          lifecycle_day7_sent?: boolean
          profile_id?: string
          status?: Database["public"]["Enums"]["membership_status"]
          volunteer_role?: Database["public"]["Enums"]["community_role"] | null
        }
        Relationships: [
          {
            foreignKeyName: "memberships_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_regions: {
        Row: {
          created_at: string | null
          depth: number | null
          full_path: string | null
          id: string
          mentor_id: string | null
          meta: Json | null
          name: string
          parent_id: string | null
          slug: string
        }
        Insert: {
          created_at?: string | null
          depth?: number | null
          full_path?: string | null
          id?: string
          mentor_id?: string | null
          meta?: Json | null
          name: string
          parent_id?: string | null
          slug: string
        }
        Update: {
          created_at?: string | null
          depth?: number | null
          full_path?: string | null
          id?: string
          mentor_id?: string | null
          meta?: Json | null
          name?: string
          parent_id?: string | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "nexus_regions_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_regions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "nexus_regions"
            referencedColumns: ["id"]
          },
        ]
      }
      nexuses: {
        Row: {
          created_at: string | null
          id: string
          member_cap: number
          mentor_id: string | null
          name: string
          outpost_id: string
          slug: string
          status: Database["public"]["Enums"]["group_status"]
        }
        Insert: {
          created_at?: string | null
          id?: string
          member_cap?: number
          mentor_id?: string | null
          name: string
          outpost_id: string
          slug: string
          status?: Database["public"]["Enums"]["group_status"]
        }
        Update: {
          created_at?: string | null
          id?: string
          member_cap?: number
          mentor_id?: string | null
          name?: string
          outpost_id?: string
          slug?: string
          status?: Database["public"]["Enums"]["group_status"]
        }
        Relationships: [
          {
            foreignKeyName: "nexuses_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexuses_outpost_id_fkey"
            columns: ["outpost_id"]
            isOneToOne: false
            referencedRelation: "outposts"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          email_dispatches: boolean
          email_events: boolean
          email_lifecycle: boolean
          email_mentions: boolean
          inapp_dispatches: boolean
          inapp_events: boolean
          inapp_lifecycle: boolean
          inapp_mentions: boolean
          profile_id: string
          push_dispatches: boolean
          push_events: boolean
          push_lifecycle: boolean
          push_mentions: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          email_dispatches?: boolean
          email_events?: boolean
          email_lifecycle?: boolean
          email_mentions?: boolean
          inapp_dispatches?: boolean
          inapp_events?: boolean
          inapp_lifecycle?: boolean
          inapp_mentions?: boolean
          profile_id: string
          push_dispatches?: boolean
          push_events?: boolean
          push_lifecycle?: boolean
          push_mentions?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          email_dispatches?: boolean
          email_events?: boolean
          email_lifecycle?: boolean
          email_mentions?: boolean
          inapp_dispatches?: boolean
          inapp_events?: boolean
          inapp_lifecycle?: boolean
          inapp_mentions?: boolean
          profile_id?: string
          push_dispatches?: boolean
          push_events?: boolean
          push_lifecycle?: boolean
          push_mentions?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          body: string | null
          created_at: string | null
          id: string
          read_at: string | null
          recipient_id: string
          reference_id: string | null
          reference_type: string | null
          type: string
        }
        Insert: {
          actor_id?: string | null
          body?: string | null
          created_at?: string | null
          id?: string
          read_at?: string | null
          recipient_id: string
          reference_id?: string | null
          reference_type?: string | null
          type: string
        }
        Update: {
          actor_id?: string | null
          body?: string | null
          created_at?: string | null
          id?: string
          read_at?: string | null
          recipient_id?: string
          reference_id?: string | null
          reference_type?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      outposts: {
        Row: {
          created_at: string | null
          id: string
          name: string
          region_id: string | null
          slug: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          region_id?: string | null
          slug: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          region_id?: string | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "outposts_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "nexus_regions"
            referencedColumns: ["id"]
          },
        ]
      }
      post_mentions: {
        Row: {
          created_at: string | null
          id: string
          post_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_id: string
          profile_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          post_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_mentions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_mentions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reactions: {
        Row: {
          created_at: string | null
          id: string
          post_id: string
          profile_id: string
          reaction_type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_id: string
          profile_id: string
          reaction_type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          post_id?: string
          profile_id?: string
          reaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_id: string
          body: string | null
          comment_count: number
          created_at: string | null
          engagement_score: number
          hidden_at: string | null
          hidden_by: string | null
          id: string
          is_pinned: boolean | null
          media_urls: string[] | null
          parent_id: string | null
          post_type: Database["public"]["Enums"]["post_type"] | null
          reaction_count: number
          reply_count: number
          scope_id: string | null
          updated_at: string | null
          visibility: Database["public"]["Enums"]["post_visibility"] | null
        }
        Insert: {
          author_id: string
          body?: string | null
          comment_count?: number
          created_at?: string | null
          engagement_score?: number
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          is_pinned?: boolean | null
          media_urls?: string[] | null
          parent_id?: string | null
          post_type?: Database["public"]["Enums"]["post_type"] | null
          reaction_count?: number
          reply_count?: number
          scope_id?: string | null
          updated_at?: string | null
          visibility?: Database["public"]["Enums"]["post_visibility"] | null
        }
        Update: {
          author_id?: string
          body?: string | null
          comment_count?: number
          created_at?: string | null
          engagement_score?: number
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          is_pinned?: boolean | null
          media_urls?: string[] | null
          parent_id?: string | null
          post_type?: Database["public"]["Enums"]["post_type"] | null
          reaction_count?: number
          reply_count?: number
          scope_id?: string | null
          updated_at?: string | null
          visibility?: Database["public"]["Enums"]["post_visibility"] | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_hidden_by_fkey"
            columns: ["hidden_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          achievement_count: number
          auth_user_id: string | null
          avatar_url: string | null
          bio: string | null
          community_role: Database["public"]["Enums"]["community_role"] | null
          created_at: string | null
          current_season_gems: number
          current_season_rank: Database["public"]["Enums"]["season_rank_enum"]
          current_season_zaps: number
          current_streak: number
          custom_title: string | null
          display_name: string
          embedding: string | null
          entity_types: string[] | null
          handle: string
          id: string
          is_active: boolean | null
          is_crew_lead: boolean | null
          is_system: boolean
          last_seen_at: string | null
          lifetime_gems: number
          lifetime_zaps: number
          longest_streak: number
          meta: Json | null
          nexus_region_id: string | null
          profile_border: string | null
          profile_flair: string | null
          profile_theme: string | null
          season_challenges_complete: boolean
          suspended_at: string | null
          suspended_by: string | null
          suspended_reason: string | null
          suspended_until: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          achievement_count?: number
          auth_user_id?: string | null
          avatar_url?: string | null
          bio?: string | null
          community_role?: Database["public"]["Enums"]["community_role"] | null
          created_at?: string | null
          current_season_gems?: number
          current_season_rank?: Database["public"]["Enums"]["season_rank_enum"]
          current_season_zaps?: number
          current_streak?: number
          custom_title?: string | null
          display_name: string
          embedding?: string | null
          entity_types?: string[] | null
          handle: string
          id?: string
          is_active?: boolean | null
          is_crew_lead?: boolean | null
          is_system?: boolean
          last_seen_at?: string | null
          lifetime_gems?: number
          lifetime_zaps?: number
          longest_streak?: number
          meta?: Json | null
          nexus_region_id?: string | null
          profile_border?: string | null
          profile_flair?: string | null
          profile_theme?: string | null
          season_challenges_complete?: boolean
          suspended_at?: string | null
          suspended_by?: string | null
          suspended_reason?: string | null
          suspended_until?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          achievement_count?: number
          auth_user_id?: string | null
          avatar_url?: string | null
          bio?: string | null
          community_role?: Database["public"]["Enums"]["community_role"] | null
          created_at?: string | null
          current_season_gems?: number
          current_season_rank?: Database["public"]["Enums"]["season_rank_enum"]
          current_season_zaps?: number
          current_streak?: number
          custom_title?: string | null
          display_name?: string
          embedding?: string | null
          entity_types?: string[] | null
          handle?: string
          id?: string
          is_active?: boolean | null
          is_crew_lead?: boolean | null
          is_system?: boolean
          last_seen_at?: string | null
          lifetime_gems?: number
          lifetime_zaps?: number
          longest_streak?: number
          meta?: Json | null
          nexus_region_id?: string | null
          profile_border?: string | null
          profile_flair?: string | null
          profile_theme?: string | null
          season_challenges_complete?: boolean
          suspended_at?: string | null
          suspended_by?: string | null
          suspended_reason?: string | null
          suspended_until?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_nexus_region_id_fkey"
            columns: ["nexus_region_id"]
            isOneToOne: false
            referencedRelation: "nexus_regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_suspended_by_fkey"
            columns: ["suspended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          profile_id: string
          user_agent: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          profile_id: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          profile_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quest_chains: {
        Row: {
          created_at: string
          description: string
          icon: string
          id: string
          name: string
          season: number | null
          slug: string
          sort_order: number
          zaps_reward: number
        }
        Insert: {
          created_at?: string
          description: string
          icon?: string
          id?: string
          name: string
          season?: number | null
          slug: string
          sort_order?: number
          zaps_reward?: number
        }
        Update: {
          created_at?: string
          description?: string
          icon?: string
          id?: string
          name?: string
          season?: number | null
          slug?: string
          sort_order?: number
          zaps_reward?: number
        }
        Relationships: []
      }
      quest_progress: {
        Row: {
          chain_id: string
          completed_at: string | null
          current_step: number
          id: string
          profile_id: string
          started_at: string
          step_progress: number
        }
        Insert: {
          chain_id: string
          completed_at?: string | null
          current_step?: number
          id?: string
          profile_id: string
          started_at?: string
          step_progress?: number
        }
        Update: {
          chain_id?: string
          completed_at?: string | null
          current_step?: number
          id?: string
          profile_id?: string
          started_at?: string
          step_progress?: number
        }
        Relationships: [
          {
            foreignKeyName: "quest_progress_chain_id_fkey"
            columns: ["chain_id"]
            isOneToOne: false
            referencedRelation: "quest_chains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quest_progress_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quest_steps: {
        Row: {
          chain_id: string
          criteria: Json
          description: string
          id: string
          name: string
          step_order: number
          target: number
          zaps_reward: number
        }
        Insert: {
          chain_id: string
          criteria?: Json
          description: string
          id?: string
          name: string
          step_order: number
          target?: number
          zaps_reward?: number
        }
        Update: {
          chain_id?: string
          criteria?: Json
          description?: string
          id?: string
          name?: string
          step_order?: number
          target?: number
          zaps_reward?: number
        }
        Relationships: [
          {
            foreignKeyName: "quest_steps_chain_id_fkey"
            columns: ["chain_id"]
            isOneToOne: false
            referencedRelation: "quest_chains"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string | null
          details: string | null
          id: string
          reason: string
          reporter_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string | null
          details?: string | null
          id?: string
          reason: string
          reporter_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string | null
          details?: string | null
          id?: string
          reason?: string
          reporter_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      room_members: {
        Row: {
          is_admin: boolean
          joined_at: string
          last_read_at: string | null
          profile_id: string
          room_id: string
        }
        Insert: {
          is_admin?: boolean
          joined_at?: string
          last_read_at?: string | null
          profile_id: string
          room_id: string
        }
        Update: {
          is_admin?: boolean
          joined_at?: string
          last_read_at?: string | null
          profile_id?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_messages: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          media_url: string | null
          parent_id: string | null
          room_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          media_url?: string | null
          parent_id?: string | null
          room_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          media_url?: string | null
          parent_id?: string | null
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "room_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          created_at: string
          creator_id: string
          description: string | null
          id: string
          last_message_at: string | null
          member_count: number
          name: string
          scope_id: string | null
          visibility: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          description?: string | null
          id?: string
          last_message_at?: string | null
          member_count?: number
          name: string
          scope_id?: string | null
          visibility?: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          description?: string | null
          id?: string
          last_message_at?: string | null
          member_count?: number
          name?: string
          scope_id?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      season_challenges: {
        Row: {
          category: Database["public"]["Enums"]["achievement_category"]
          created_at: string
          criteria: Json
          description: string
          difficulty: Database["public"]["Enums"]["challenge_difficulty"]
          id: string
          name: string
          season: number
          slug: string
          sort_order: number
          target: number
          zaps_reward: number
        }
        Insert: {
          category: Database["public"]["Enums"]["achievement_category"]
          created_at?: string
          criteria?: Json
          description: string
          difficulty?: Database["public"]["Enums"]["challenge_difficulty"]
          id?: string
          name: string
          season?: number
          slug: string
          sort_order?: number
          target?: number
          zaps_reward?: number
        }
        Update: {
          category?: Database["public"]["Enums"]["achievement_category"]
          created_at?: string
          criteria?: Json
          description?: string
          difficulty?: Database["public"]["Enums"]["challenge_difficulty"]
          id?: string
          name?: string
          season?: number
          slug?: string
          sort_order?: number
          target?: number
          zaps_reward?: number
        }
        Relationships: []
      }
      season_trophies: {
        Row: {
          challenges_completed: number
          created_at: string
          final_rank: string
          final_zaps: number
          gems_converted: number
          id: string
          profile_id: string
          season: number
        }
        Insert: {
          challenges_completed?: number
          created_at?: string
          final_rank: string
          final_zaps?: number
          gems_converted?: number
          id?: string
          profile_id: string
          season: number
        }
        Update: {
          challenges_completed?: number
          created_at?: string
          final_rank?: string
          final_zaps?: number
          gems_converted?: number
          id?: string
          profile_id?: string
          season?: number
        }
        Relationships: [
          {
            foreignKeyName: "season_trophies_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      store_items: {
        Row: {
          category: Database["public"]["Enums"]["store_category"]
          created_at: string
          description: string
          gem_cost: number
          icon: string
          id: string
          is_active: boolean
          metadata: Json
          name: string
          preview: string | null
          slug: string
          sort_order: number
          stock: number | null
        }
        Insert: {
          category: Database["public"]["Enums"]["store_category"]
          created_at?: string
          description: string
          gem_cost: number
          icon?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          preview?: string | null
          slug: string
          sort_order?: number
          stock?: number | null
        }
        Update: {
          category?: Database["public"]["Enums"]["store_category"]
          created_at?: string
          description?: string
          gem_cost?: number
          icon?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          preview?: string | null
          slug?: string
          sort_order?: number
          stock?: number | null
        }
        Relationships: []
      }
      store_redemptions: {
        Row: {
          gems_spent: number
          id: string
          item_id: string
          metadata: Json | null
          profile_id: string
          redeemed_at: string
        }
        Insert: {
          gems_spent: number
          id?: string
          item_id: string
          metadata?: Json | null
          profile_id: string
          redeemed_at?: string
        }
        Update: {
          gems_spent?: number
          id?: string
          item_id?: string
          metadata?: Json | null
          profile_id?: string
          redeemed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_redemptions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "store_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_redemptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      streaks: {
        Row: {
          current_count: number
          freeze_tokens: number
          id: string
          last_activity_at: string | null
          longest_count: number
          profile_id: string
          streak_type: Database["public"]["Enums"]["streak_type"]
          updated_at: string
        }
        Insert: {
          current_count?: number
          freeze_tokens?: number
          id?: string
          last_activity_at?: string | null
          longest_count?: number
          profile_id: string
          streak_type: Database["public"]["Enums"]["streak_type"]
          updated_at?: string
        }
        Update: {
          current_count?: number
          freeze_tokens?: number
          id?: string
          last_activity_at?: string | null
          longest_count?: number
          profile_id?: string
          streak_type?: Database["public"]["Enums"]["streak_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "streaks_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      topical_channel_memberships: {
        Row: {
          id: string
          joined_at: string
          profile_id: string
          topical_channel_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          profile_id: string
          topical_channel_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          profile_id?: string
          topical_channel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "topical_channel_memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topical_channel_memberships_topical_channel_id_fkey"
            columns: ["topical_channel_id"]
            isOneToOne: false
            referencedRelation: "topical_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      topical_channels: {
        Row: {
          category: string
          cover_image: string | null
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          name: string
          slug: string
        }
        Insert: {
          category: string
          cover_image?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          slug: string
        }
        Update: {
          category?: string
          cover_image?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          achievement_id: string
          id: string
          profile_id: string
          unlocked_at: string
        }
        Insert: {
          achievement_id: string
          id?: string
          profile_id: string
          unlocked_at?: string
        }
        Update: {
          achievement_id?: string
          id?: string
          profile_id?: string
          unlocked_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_achievements_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      am_participant: { Args: { p_conversation_id: string }; Returns: boolean }
      am_room_member: { Args: { p_room_id: string }; Returns: boolean }
      are_friends: { Args: { a: string; b: string }; Returns: boolean }
      get_my_circle_id: { Args: never; Returns: string }
      get_my_circle_ids: { Args: never; Returns: string[] }
      get_my_group_ids: { Args: never; Returns: string[] }
      get_my_hub_id: { Args: never; Returns: string }
      get_my_nexus_id: { Args: never; Returns: string }
      get_my_outpost_id: { Args: never; Returns: string }
      get_my_profile_id: { Args: never; Returns: string }
      get_my_region_id: { Args: never; Returns: string }
      get_my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["community_role"]
      }
      handle_is_available: { Args: { check_handle: string }; Returns: boolean }
      public_active_circle_count: { Args: never; Returns: number }
      public_circle_by_id: {
        Args: { _id: string }
        Returns: {
          about: string
          channel_name: string
          channel_slug: string
          city: string
          id: string
          member_count: number
          name: string
          slug: string
          status: string
          type: string
        }[]
      }
      public_circles: {
        Args: { _limit?: number }
        Returns: {
          about: string
          channel_name: string
          channel_slug: string
          city: string
          id: string
          member_count: number
          name: string
          slug: string
          status: string
          type: string
        }[]
      }
      public_event_by_slug: {
        Args: { _slug: string }
        Returns: {
          circle_id: string
          circle_name: string
          city: string
          description: string
          ends_at: string
          id: string
          slug: string
          starts_at: string
          title: string
        }[]
      }
      public_events: {
        Args: { _limit?: number }
        Returns: {
          circle_id: string
          circle_name: string
          city: string
          description: string
          ends_at: string
          id: string
          slug: string
          starts_at: string
          title: string
        }[]
      }
      public_member_count: { Args: never; Returns: number }
      public_posts: {
        Args: { _limit?: number }
        Returns: {
          author_avatar_url: string
          author_display_name: string
          author_handle: string
          body: string
          created_at: string
          id: string
          media_urls: string[]
        }[]
      }
      reset_season: { Args: never; Returns: undefined }
      search_handles_public: {
        Args: { q: string }
        Returns: {
          avatar_url: string
          display_name: string
          handle: string
          id: string
        }[]
      }
    }
    Enums: {
      achievement_category:
        | "social"
        | "events"
        | "content"
        | "leadership"
        | "streak"
        | "seasonal"
        | "special"
      achievement_tier: "bronze" | "silver" | "gold" | "platinum"
      challenge_difficulty: "easy" | "normal" | "hard" | "legendary"
      channel_content_type: "group" | "event" | "thread"
      channel_scope_type: "hub" | "nexus" | "outpost"
      circle_type: "in-person" | "online"
      community_role:
        | "member"
        | "crew"
        | "host"
        | "guide"
        | "mentor"
        | "janitor"
      group_status: "forming" | "active" | "inactive" | "archived"
      membership_status: "active" | "pending" | "inactive"
      post_type: "feed" | "blog" | "announcement" | "recap"
      post_visibility: "public" | "region" | "cluster" | "group"
      season_rank_enum:
        | "ghost"
        | "runner"
        | "operative"
        | "agent"
        | "conduit"
        | "luminary"
      store_category:
        | "cosmetic"
        | "membership"
        | "feature"
        | "title"
        | "collectible"
      streak_type: "attendance" | "posting" | "hosting" | "login"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      achievement_category: [
        "social",
        "events",
        "content",
        "leadership",
        "streak",
        "seasonal",
        "special",
      ],
      achievement_tier: ["bronze", "silver", "gold", "platinum"],
      challenge_difficulty: ["easy", "normal", "hard", "legendary"],
      channel_content_type: ["group", "event", "thread"],
      channel_scope_type: ["hub", "nexus", "outpost"],
      circle_type: ["in-person", "online"],
      community_role: ["member", "crew", "host", "guide", "mentor", "janitor"],
      group_status: ["forming", "active", "inactive", "archived"],
      membership_status: ["active", "pending", "inactive"],
      post_type: ["feed", "blog", "announcement", "recap"],
      post_visibility: ["public", "region", "cluster", "group"],
      season_rank_enum: [
        "ghost",
        "runner",
        "operative",
        "agent",
        "conduit",
        "luminary",
      ],
      store_category: [
        "cosmetic",
        "membership",
        "feature",
        "title",
        "collectible",
      ],
      streak_type: ["attendance", "posting", "hosting", "login"],
    },
  },
} as const
