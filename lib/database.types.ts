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
      agent_actions: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          kind: string
          payload: Json
          rationale: string | null
          status: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          kind: string
          payload?: Json
          rationale?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          kind?: string
          payload?: Json
          rationale?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_actions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      area_permissions: {
        Row: {
          area_key: string
          min_role: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          area_key: string
          min_role: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          area_key?: string
          min_role?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "area_permissions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          action_config: Json
          action_type: string
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          name: string
          trigger_event: string
        }
        Insert: {
          action_config?: Json
          action_type?: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          name: string
          trigger_event: string
        }
        Update: {
          action_config?: Json
          action_type?: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          name?: string
          trigger_event?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_users: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocked_users_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_users_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          recipient_count: number
          segment: string
          sent_at: string | null
          status: string
          subject: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          recipient_count?: number
          segment?: string
          sent_at?: string | null
          status?: string
          subject: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          recipient_count?: number
          segment?: string
          sent_at?: string | null
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      captures: {
        Row: {
          actor_profile_id: string
          captured_at: string
          engagement_event_id: string | null
          id: string
          location: unknown
          node_id: string
          verified: boolean
        }
        Insert: {
          actor_profile_id: string
          captured_at?: string
          engagement_event_id?: string | null
          id?: string
          location?: unknown
          node_id: string
          verified?: boolean
        }
        Update: {
          actor_profile_id?: string
          captured_at?: string
          engagement_event_id?: string | null
          id?: string
          location?: unknown
          node_id?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "captures_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captures_engagement_event_id_fkey"
            columns: ["engagement_event_id"]
            isOneToOne: false
            referencedRelation: "engagement_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captures_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
        ]
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
      circle_practices: {
        Row: {
          active: boolean
          circle_id: string
          created_at: string
          id: string
          practice_id: string
          set_by: string | null
        }
        Insert: {
          active?: boolean
          circle_id: string
          created_at?: string
          id?: string
          practice_id: string
          set_by?: string | null
        }
        Update: {
          active?: boolean
          circle_id?: string
          created_at?: string
          id?: string
          practice_id?: string
          set_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "circle_practices_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_practices_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_practices_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      circles: {
        Row: {
          is_demo: boolean
          about: string | null
          city: string | null
          created_at: string | null
          geog: unknown
          host_id: string | null
          hub_id: string | null
          id: string
          image_url: string | null
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
          is_demo?: boolean
          about?: string | null
          city?: string | null
          created_at?: string | null
          geog?: unknown
          host_id?: string | null
          hub_id?: string | null
          id?: string
          image_url?: string | null
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
          is_demo?: boolean
          about?: string | null
          city?: string | null
          created_at?: string | null
          geog?: unknown
          host_id?: string | null
          hub_id?: string | null
          id?: string
          image_url?: string | null
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
      contacts: {
        Row: {
          consent_state: string
          created_at: string
          display_name: string | null
          email: string
          engagement_score: number
          first_seen_at: string
          id: string
          last_seen_at: string | null
          meta: Json
          profile_id: string | null
          source: string | null
          updated_at: string
        }
        Insert: {
          consent_state?: string
          created_at?: string
          display_name?: string | null
          email: string
          engagement_score?: number
          first_seen_at?: string
          id?: string
          last_seen_at?: string | null
          meta?: Json
          profile_id?: string | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          consent_state?: string
          created_at?: string
          display_name?: string | null
          email?: string
          engagement_score?: number
          first_seen_at?: string
          id?: string
          last_seen_at?: string | null
          meta?: Json
          profile_id?: string | null
          source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      email_events: {
        Row: {
          created_at: string
          email: string
          event_type: string
          id: string
          payload: Json
          provider_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          event_type: string
          id?: string
          payload?: Json
          provider_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          event_type?: string
          id?: string
          payload?: Json
          provider_id?: string | null
        }
        Relationships: []
      }
      email_suppressions: {
        Row: {
          created_at: string
          email: string
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          reason?: string
        }
        Relationships: []
      }
      engagement_events: {
        Row: {
          actor_profile_id: string | null
          context: Json
          created_at: string
          event_type: string
          id: string
          idempotency_key: string
          source: string
          verified_at: string | null
        }
        Insert: {
          actor_profile_id?: string | null
          context?: Json
          created_at?: string
          event_type: string
          id?: string
          idempotency_key: string
          source: string
          verified_at?: string | null
        }
        Update: {
          actor_profile_id?: string | null
          context?: Json
          created_at?: string
          event_type?: string
          id?: string
          idempotency_key?: string
          source?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engagement_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          is_demo: boolean
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
          is_demo?: boolean
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
          is_demo?: boolean
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
      member_practices: {
        Row: {
          active: boolean
          created_at: string
          id: string
          practice_id: string
          profile_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          practice_id: string
          profile_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          practice_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_practices_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_practices_profile_id_fkey"
            columns: ["profile_id"]
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
      nodes: {
        Row: {
          active: boolean
          capture_rule: string
          created_at: string
          id: string
          label: string | null
          location: unknown
          owner_profile_id: string | null
          partner_id: string | null
          proximity_m: number | null
          reward_event_type: string | null
          secret: string | null
          type: string
          valid_from: string | null
          valid_until: string | null
          zaps_value: number
        }
        Insert: {
          active?: boolean
          capture_rule?: string
          created_at?: string
          id?: string
          label?: string | null
          location?: unknown
          owner_profile_id?: string | null
          partner_id?: string | null
          proximity_m?: number | null
          reward_event_type?: string | null
          secret?: string | null
          type: string
          valid_from?: string | null
          valid_until?: string | null
          zaps_value?: number
        }
        Update: {
          active?: boolean
          capture_rule?: string
          created_at?: string
          id?: string
          label?: string | null
          location?: unknown
          owner_profile_id?: string | null
          partner_id?: string | null
          proximity_m?: number | null
          reward_event_type?: string | null
          secret?: string | null
          type?: string
          valid_from?: string | null
          valid_until?: string | null
          zaps_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "nodes_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nodes_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
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
      notification_queue: {
        Row: {
          attempts: number
          created_at: string
          id: string
          kind: string
          last_error: string | null
          max_attempts: number
          payload: Json
          run_after: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          kind: string
          last_error?: string | null
          max_attempts?: number
          payload?: Json
          run_after?: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          max_attempts?: number
          payload?: Json
          run_after?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
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
      pages: {
        Row: {
          data: Json
          id: string
          og_image_url: string | null
          published_at: string | null
          published_data: Json | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          status: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          data?: Json
          id?: string
          og_image_url?: string | null
          published_at?: string | null
          published_data?: Json | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          status?: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          data?: Json
          id?: string
          og_image_url?: string | null
          published_at?: string | null
          published_data?: Json | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pages_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_offers: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          member_terms: string | null
          partner_id: string
          title: string
          valid_until: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          member_terms?: string | null
          partner_id: string
          title: string
          valid_until?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          member_terms?: string | null
          partner_id?: string
          title?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_offers_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_redemptions: {
        Row: {
          engagement_event_id: string | null
          id: string
          offer_id: string | null
          partner_id: string
          profile_id: string
          redeemed_at: string
          source: string | null
        }
        Insert: {
          engagement_event_id?: string | null
          id?: string
          offer_id?: string | null
          partner_id: string
          profile_id: string
          redeemed_at?: string
          source?: string | null
        }
        Update: {
          engagement_event_id?: string | null
          id?: string
          offer_id?: string | null
          partner_id?: string
          profile_id?: string
          redeemed_at?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_redemptions_engagement_event_id_fkey"
            columns: ["engagement_event_id"]
            isOneToOne: false
            referencedRelation: "engagement_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_redemptions_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "partner_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_redemptions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_redemptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          address: string | null
          category: string | null
          city: string | null
          contact_profile_id: string | null
          created_at: string
          description: string | null
          id: string
          location: unknown
          name: string
          slug: string
          status: string
          website: string | null
        }
        Insert: {
          address?: string | null
          category?: string | null
          city?: string | null
          contact_profile_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          location?: unknown
          name: string
          slug: string
          status?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          category?: string | null
          city?: string | null
          contact_profile_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          location?: unknown
          name?: string
          slug?: string
          status?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partners_contact_profile_id_fkey"
            columns: ["contact_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          is_demo: boolean
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
          is_demo?: boolean
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
          is_demo?: boolean
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
      practice_logs: {
        Row: {
          circle_id: string | null
          created_at: string
          id: string
          logged_for: string
          practice_id: string | null
          profile_id: string
        }
        Insert: {
          circle_id?: string | null
          created_at?: string
          id?: string
          logged_for?: string
          practice_id?: string | null
          profile_id: string
        }
        Update: {
          circle_id?: string | null
          created_at?: string
          id?: string
          logged_for?: string
          practice_id?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_logs_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_logs_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_logs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      practices: {
        Row: {
          is_demo: boolean
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_public: boolean
          title: string
        }
        Insert: {
          is_demo?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_public?: boolean
          title: string
        }
        Update: {
          is_demo?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_public?: boolean
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "practices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          is_demo: boolean
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
          is_demo?: boolean
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
          is_demo?: boolean
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
      seasons: {
        Row: {
          created_at: string
          ends_at: string | null
          id: string
          name: string
          season_number: number
          starts_at: string
          status: string
          theme: string | null
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          id?: string
          name: string
          season_number: number
          starts_at?: string
          status?: string
          theme?: string | null
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          id?: string
          name?: string
          season_number?: number
          starts_at?: string
          status?: string
          theme?: string | null
        }
        Relationships: []
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
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
      team_members: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          role: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          role?: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
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
      zap_config: {
        Row: {
          action_type: string
          created_at: string
          daily_cap: number | null
          description: string | null
          id: string
          is_active: boolean
          zaps_amount: number
        }
        Insert: {
          action_type: string
          created_at?: string
          daily_cap?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          zaps_amount?: number
        }
        Update: {
          action_type?: string
          created_at?: string
          daily_cap?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          zaps_amount?: number
        }
        Relationships: []
      }
    }
    Views: {
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      am_participant: { Args: { p_conversation_id: string }; Returns: boolean }
      am_room_member: { Args: { p_room_id: string }; Returns: boolean }
      are_friends: { Args: { a: string; b: string }; Returns: boolean }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      circles_near: {
        Args: { _lat: number; _lng: number; _limit?: number }
        Returns: {
          id: string
          name: string
          slug: string
          about: string | null
          type: string
          member_count: number
          member_cap: number
          status: string
          neighborhood: string | null
          city: string | null
          image_url: string | null
          latitude: number | null
          longitude: number | null
          distance_m: number
        }[]
      }
      feed_for_viewer: {
        Args: { _limit?: number; _sort?: string }
        Returns: {
          author: Json
          body: string
          comment_count: number
          created_at: string
          engagement_score: number
          id: string
          is_pinned: boolean
          media_urls: string[]
          post_type: string
          reaction_count: number
          reactions: Json
          scope_id: string
          visibility: string
        }[]
      }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_my_circle_id: { Args: never; Returns: string }
      get_my_circle_ids: { Args: never; Returns: string[] }
      get_my_group_ids: { Args: never; Returns: string[] }
      get_my_hub_id: { Args: never; Returns: string }
      get_my_hub_ids: { Args: never; Returns: string[] }
      get_my_nexus_id: { Args: never; Returns: string }
      get_my_outpost_id: { Args: never; Returns: string }
      get_my_profile_id: { Args: never; Returns: string }
      get_my_region_id: { Args: never; Returns: string }
      get_my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["community_role"]
      }
      get_my_tuned_channel_ids: { Args: never; Returns: string[] }
      gettransactionid: { Args: never; Returns: unknown }
      handle_is_available: { Args: { check_handle: string }; Returns: boolean }
      is_blocked_between: { Args: { a: string; b: string }; Returns: boolean }
      longtransactionsenabled: { Args: never; Returns: boolean }
      my_friendships: {
        Args: never
        Returns: {
          friendship_id: string
          i_requested: boolean
          other_avatar_url: string
          other_display_name: string
          other_handle: string
          other_id: string
          requested_at: string
          status: string
        }[]
      }
      my_notifications: {
        Args: { _limit?: number }
        Returns: {
          actor_avatar_url: string
          actor_display_name: string
          actor_handle: string
          actor_id: string
          body: string
          created_at: string
          id: string
          read_at: string
          reference_id: string
          reference_type: string
          type: string
        }[]
      }
      my_unread_notification_count: { Args: never; Returns: number }
      node_within_range: {
        Args: { p_lat: number; p_lng: number; p_node_id: string }
        Returns: boolean
      }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
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
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      unlockrows: { Args: { "": string }; Returns: number }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
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
        | "admin"
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
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
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
      community_role: [
        "member",
        "crew",
        "host",
        "guide",
        "mentor",
        "admin",
        "janitor",
      ],
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
