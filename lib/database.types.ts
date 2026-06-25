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
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          detail: Json
          id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      ai_help_queries: {
        Row: {
          answered: boolean
          confidence: number
          created_at: string
          deflected: boolean
          id: string
          profile_id: string | null
          question: string
          top_category: string | null
          top_slug: string | null
        }
        Insert: {
          answered?: boolean
          confidence?: number
          created_at?: string
          deflected?: boolean
          id?: string
          profile_id?: string | null
          question: string
          top_category?: string | null
          top_slug?: string | null
        }
        Update: {
          answered?: boolean
          confidence?: number
          created_at?: string
          deflected?: boolean
          id?: string
          profile_id?: string | null
          question?: string
          top_category?: string | null
          top_slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_help_queries_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_member_context: {
        Row: {
          created_at: string
          facts: Json
          interaction_count: number
          last_summarized_at: string | null
          milestones: Json
          profile_id: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          facts?: Json
          interaction_count?: number
          last_summarized_at?: string | null
          milestones?: Json
          profile_id: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          facts?: Json
          interaction_count?: number
          last_summarized_at?: string | null
          milestones?: Json
          profile_id?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_member_context_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage: {
        Row: {
          cost_usd: number
          created_at: string
          feature: string
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          profile_id: string | null
          space_id: string | null
        }
        Insert: {
          cost_usd?: number
          created_at?: string
          feature: string
          id?: string
          input_tokens?: number
          model: string
          output_tokens?: number
          profile_id?: string | null
          space_id?: string | null
        }
        Update: {
          cost_usd?: number
          created_at?: string
          feature?: string
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          profile_id?: string | null
          space_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
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
          scheduled_for: string | null
          segment: string
          sent_at: string | null
          space_id: string | null
          status: string
          subject: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          recipient_count?: number
          scheduled_for?: string | null
          segment?: string
          sent_at?: string | null
          space_id?: string | null
          status?: string
          subject: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          recipient_count?: number
          scheduled_for?: string | null
          segment?: string
          sent_at?: string | null
          space_id?: string | null
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
          {
            foreignKeyName: "campaigns_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      capability_permissions: {
        Row: {
          access: string
          domain: string
          role: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          access: string
          domain: string
          role: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          access?: string
          domain?: string
          role?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "capability_permissions_updated_by_fkey"
            columns: ["updated_by"]
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
          space_id: string | null
          verified: boolean
        }
        Insert: {
          actor_profile_id: string
          captured_at?: string
          engagement_event_id?: string | null
          id?: string
          location?: unknown
          node_id: string
          space_id?: string | null
          verified?: boolean
        }
        Update: {
          actor_profile_id?: string
          captured_at?: string
          engagement_event_id?: string | null
          id?: string
          location?: unknown
          node_id?: string
          space_id?: string | null
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
          {
            foreignKeyName: "captures_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
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
      challenge_qr_codes: {
        Row: {
          challenge_id: string
          created_at: string
          id: string
          qr_code_id: string
        }
        Insert: {
          challenge_id: string
          created_at?: string
          id?: string
          qr_code_id: string
        }
        Update: {
          challenge_id?: string
          created_at?: string
          id?: string
          qr_code_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_qr_codes_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "season_challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_qr_codes_qr_code_id_fkey"
            columns: ["qr_code_id"]
            isOneToOne: false
            referencedRelation: "qr_codes"
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
      circle_challenge_adoptions: {
        Row: {
          adopted_by: string | null
          challenge_id: string
          circle_id: string
          created_at: string
          id: string
        }
        Insert: {
          adopted_by?: string | null
          challenge_id: string
          circle_id: string
          created_at?: string
          id?: string
        }
        Update: {
          adopted_by?: string | null
          challenge_id?: string
          circle_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "circle_challenge_adoptions_adopted_by_fkey"
            columns: ["adopted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_challenge_adoptions_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "season_challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_challenge_adoptions_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
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
            foreignKeyName: "circle_practices_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices_ranked"
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
      circle_profiles: {
        Row: {
          agreements: Json
          circle_id: string
          editor_notes: Json
          format: string | null
          gathering: Json
          meetup: Json
          pillars_inside: Json
          recommended_journey_pillar: string | null
          remix_options: Json
          size_label: string | null
          thread: string | null
          updated_at: string
        }
        Insert: {
          agreements?: Json
          circle_id: string
          editor_notes?: Json
          format?: string | null
          gathering?: Json
          meetup?: Json
          pillars_inside?: Json
          recommended_journey_pillar?: string | null
          remix_options?: Json
          size_label?: string | null
          thread?: string | null
          updated_at?: string
        }
        Update: {
          agreements?: Json
          circle_id?: string
          editor_notes?: Json
          format?: string | null
          gathering?: Json
          meetup?: Json
          pillars_inside?: Json
          recommended_journey_pillar?: string | null
          remix_options?: Json
          size_label?: string | null
          thread?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "circle_profiles_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: true
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
        ]
      }
      circle_templates: {
        Row: {
          about: string | null
          agreements: Json
          audience: string
          callouts: Json
          card: string
          created_at: string
          display_order: number
          format: string | null
          gathering: Json
          id: string
          identity: string
          image_url: string | null
          is_active: boolean
          meetup: Json
          name: string
          one_liner: string
          pillars_inside: Json
          primary_pillar: string
          recommended_journey_pillar: string | null
          remix_options: Json
          size_label: string | null
          slug: string
          thread: string | null
          updated_at: string
        }
        Insert: {
          about?: string | null
          agreements?: Json
          audience: string
          callouts?: Json
          card: string
          created_at?: string
          display_order?: number
          format?: string | null
          gathering?: Json
          id?: string
          identity: string
          image_url?: string | null
          is_active?: boolean
          meetup?: Json
          name: string
          one_liner: string
          pillars_inside?: Json
          primary_pillar: string
          recommended_journey_pillar?: string | null
          remix_options?: Json
          size_label?: string | null
          slug: string
          thread?: string | null
          updated_at?: string
        }
        Update: {
          about?: string | null
          agreements?: Json
          audience?: string
          callouts?: Json
          card?: string
          created_at?: string
          display_order?: number
          format?: string | null
          gathering?: Json
          id?: string
          identity?: string
          image_url?: string | null
          is_active?: boolean
          meetup?: Json
          name?: string
          one_liner?: string
          pillars_inside?: Json
          primary_pillar?: string
          recommended_journey_pillar?: string | null
          remix_options?: Json
          size_label?: string | null
          slug?: string
          thread?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      circle_topics: {
        Row: {
          circle_id: string
          created_at: string
          topical_channel_id: string
        }
        Insert: {
          circle_id: string
          created_at?: string
          topical_channel_id: string
        }
        Update: {
          circle_id?: string
          created_at?: string
          topical_channel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "circle_topics_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_topics_topical_channel_id_fkey"
            columns: ["topical_channel_id"]
            isOneToOne: false
            referencedRelation: "topical_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      circles: {
        Row: {
          about: string | null
          city: string | null
          created_at: string | null
          featured_at: string | null
          geog: unknown
          host_id: string | null
          hub_id: string | null
          id: string
          image_url: string | null
          is_demo: boolean
          latitude: number | null
          longitude: number | null
          member_cap: number
          member_count: number
          name: string
          neighborhood: string | null
          origin_template_id: string | null
          primary_pillar: string | null
          resonance_public: boolean
          sidebar_order: Json | null
          slug: string
          space_id: string | null
          status: Database["public"]["Enums"]["group_status"]
          timezone: string | null
          topical_channel_id: string | null
          type: Database["public"]["Enums"]["circle_type"]
        }
        Insert: {
          about?: string | null
          city?: string | null
          created_at?: string | null
          featured_at?: string | null
          geog?: unknown
          host_id?: string | null
          hub_id?: string | null
          id?: string
          image_url?: string | null
          is_demo?: boolean
          latitude?: number | null
          longitude?: number | null
          member_cap?: number
          member_count?: number
          name: string
          neighborhood?: string | null
          origin_template_id?: string | null
          primary_pillar?: string | null
          resonance_public?: boolean
          sidebar_order?: Json | null
          slug: string
          space_id?: string | null
          status?: Database["public"]["Enums"]["group_status"]
          timezone?: string | null
          topical_channel_id?: string | null
          type?: Database["public"]["Enums"]["circle_type"]
        }
        Update: {
          about?: string | null
          city?: string | null
          created_at?: string | null
          featured_at?: string | null
          geog?: unknown
          host_id?: string | null
          hub_id?: string | null
          id?: string
          image_url?: string | null
          is_demo?: boolean
          latitude?: number | null
          longitude?: number | null
          member_cap?: number
          member_count?: number
          name?: string
          neighborhood?: string | null
          origin_template_id?: string | null
          primary_pillar?: string | null
          resonance_public?: boolean
          sidebar_order?: Json | null
          slug?: string
          space_id?: string | null
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
            foreignKeyName: "circles_origin_template_id_fkey"
            columns: ["origin_template_id"]
            isOneToOne: false
            referencedRelation: "circle_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circles_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
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
      client_notes: {
        Row: {
          author_profile_id: string | null
          body: string
          contact_id: string | null
          created_at: string
          id: string
          space_id: string
          updated_at: string
        }
        Insert: {
          author_profile_id?: string | null
          body?: string
          contact_id?: string | null
          created_at?: string
          id?: string
          space_id: string
          updated_at?: string
        }
        Update: {
          author_profile_id?: string | null
          body?: string
          contact_id?: string | null
          created_at?: string
          id?: string
          space_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_notes_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notes_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      commerce_order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string | null
          qty: number
          subtotal_cents: number
          title: string
          unit_cents: number
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id?: string | null
          qty?: number
          subtotal_cents: number
          title: string
          unit_cents: number
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string | null
          qty?: number
          subtotal_cents?: number
          title?: string
          unit_cents?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commerce_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "commerce_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commerce_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "commerce_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commerce_order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "commerce_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      commerce_orders: {
        Row: {
          amount_cents: number
          buyer_profile_id: string | null
          created_at: string
          currency: string
          entity_id: string
          fulfillment_status: string
          id: string
          metadata: Json
          owner_kind: string
          owner_profile_id: string | null
          owner_space_id: string | null
          paid_at: string | null
          platform_fee_cents: number
          refunded_at: string | null
          seller_stripe_account_id: string | null
          shipping: Json
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
        }
        Insert: {
          amount_cents: number
          buyer_profile_id?: string | null
          created_at?: string
          currency?: string
          entity_id: string
          fulfillment_status?: string
          id?: string
          metadata?: Json
          owner_kind: string
          owner_profile_id?: string | null
          owner_space_id?: string | null
          paid_at?: string | null
          platform_fee_cents?: number
          refunded_at?: string | null
          seller_stripe_account_id?: string | null
          shipping?: Json
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
        }
        Update: {
          amount_cents?: number
          buyer_profile_id?: string | null
          created_at?: string
          currency?: string
          entity_id?: string
          fulfillment_status?: string
          id?: string
          metadata?: Json
          owner_kind?: string
          owner_profile_id?: string | null
          owner_space_id?: string | null
          paid_at?: string | null
          platform_fee_cents?: number
          refunded_at?: string | null
          seller_stripe_account_id?: string | null
          shipping?: Json
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commerce_orders_buyer_profile_id_fkey"
            columns: ["buyer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commerce_orders_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commerce_orders_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commerce_orders_owner_space_id_fkey"
            columns: ["owner_space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      commerce_products: {
        Row: {
          booking_space_id: string | null
          category: string | null
          created_at: string
          currency: string
          description: string | null
          entity_id: string
          id: string
          images: string[]
          is_demo: boolean
          metadata: Json
          owner_kind: string
          owner_profile_id: string | null
          owner_space_id: string | null
          price_cents: number
          product_kind: string
          status: string
          stock: number | null
          title: string
          updated_at: string
          vertical: string
        }
        Insert: {
          booking_space_id?: string | null
          category?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          entity_id: string
          id?: string
          images?: string[]
          is_demo?: boolean
          metadata?: Json
          owner_kind: string
          owner_profile_id?: string | null
          owner_space_id?: string | null
          price_cents: number
          product_kind?: string
          status?: string
          stock?: number | null
          title: string
          updated_at?: string
          vertical?: string
        }
        Update: {
          booking_space_id?: string | null
          category?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          entity_id?: string
          id?: string
          images?: string[]
          is_demo?: boolean
          metadata?: Json
          owner_kind?: string
          owner_profile_id?: string | null
          owner_space_id?: string | null
          price_cents?: number
          product_kind?: string
          status?: string
          stock?: number | null
          title?: string
          updated_at?: string
          vertical?: string
        }
        Relationships: [
          {
            foreignKeyName: "commerce_products_booking_space_id_fkey"
            columns: ["booking_space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commerce_products_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commerce_products_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commerce_products_owner_space_id_fkey"
            columns: ["owner_space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      commerce_variants: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          price_cents: number | null
          product_id: string
          sku: string | null
          stock: number | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          price_cents?: number | null
          product_id: string
          sku?: string | null
          stock?: number | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          price_cents?: number | null
          product_id?: string
          sku?: string | null
          stock?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "commerce_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "commerce_products"
            referencedColumns: ["id"]
          },
        ]
      }
      connection_settings: {
        Row: {
          default_location_band: string
          directory_enabled: boolean
          id: boolean
          maps_enabled: boolean
          max_discovery_radius_m: number
          min_discovery_radius_m: number
          near_miss_enabled: boolean
          proximity_enabled: boolean
          resonance_enabled: boolean
          reward_introduction: number
          reward_welcome: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          default_location_band?: string
          directory_enabled?: boolean
          id?: boolean
          maps_enabled?: boolean
          max_discovery_radius_m?: number
          min_discovery_radius_m?: number
          near_miss_enabled?: boolean
          proximity_enabled?: boolean
          resonance_enabled?: boolean
          reward_introduction?: number
          reward_welcome?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          default_location_band?: string
          directory_enabled?: boolean
          id?: boolean
          maps_enabled?: boolean
          max_discovery_radius_m?: number
          min_discovery_radius_m?: number
          near_miss_enabled?: boolean
          proximity_enabled?: boolean
          resonance_enabled?: boolean
          reward_introduction?: number
          reward_welcome?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "connection_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_records: {
        Row: {
          created_at: string
          granted: boolean
          id: string
          note: string | null
          profile_id: string
          scope: string
          source: string
        }
        Insert: {
          created_at?: string
          granted: boolean
          id?: string
          note?: string | null
          profile_id: string
          scope: string
          source?: string
        }
        Update: {
          created_at?: string
          granted?: boolean
          id?: string
          note?: string | null
          profile_id?: string
          scope?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_records_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_interactions: {
        Row: {
          body: string | null
          channel: string
          created_at: string
          direction: string
          id: string
          idempotency_key: string | null
          metadata: Json
          occurred_at: string
          owner_profile_id: string
          source: string
          space_id: string | null
          subject_id: string
          subject_kind: string
          summary: string | null
        }
        Insert: {
          body?: string | null
          channel: string
          created_at?: string
          direction?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          occurred_at?: string
          owner_profile_id: string
          source?: string
          space_id?: string | null
          subject_id: string
          subject_kind: string
          summary?: string | null
        }
        Update: {
          body?: string | null
          channel?: string
          created_at?: string
          direction?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          occurred_at?: string
          owner_profile_id?: string
          source?: string
          space_id?: string | null
          subject_id?: string
          subject_kind?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_interactions_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_interactions_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
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
          space_id: string | null
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
          space_id?: string | null
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
          space_id?: string | null
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
          {
            foreignKeyName: "contacts_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      content_ratings: {
        Row: {
          content_id: string
          content_type: string
          created_at: string
          id: string
          profile_id: string
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string
          id?: string
          profile_id: string
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_ratings_profile_id_fkey"
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
      conversation_room_migration: {
        Row: {
          conversation_id: string
          migrated_at: string
          room_id: string
        }
        Insert: {
          conversation_id: string
          migrated_at?: string
          room_id: string
        }
        Update: {
          conversation_id?: string
          migrated_at?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_room_migration_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_room_migration_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          migrated_to_room_id: string | null
          name: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          migrated_to_room_id?: string | null
          name?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          migrated_to_room_id?: string | null
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
          {
            foreignKeyName: "conversations_migrated_to_room_id_fkey"
            columns: ["migrated_to_room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_tips: {
        Row: {
          content_id: string
          content_type: string
          created_at: string | null
          creator_id: string
          draft_text: string
          evidence: Json
          id: string
          kind: string
          reviewed_by: string | null
          sent_at: string | null
          sent_text: string | null
          status: string
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string | null
          creator_id: string
          draft_text: string
          evidence?: Json
          id?: string
          kind?: string
          reviewed_by?: string | null
          sent_at?: string | null
          sent_text?: string | null
          status?: string
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string | null
          creator_id?: string
          draft_text?: string
          evidence?: Json
          id?: string
          kind?: string
          reviewed_by?: string | null
          sent_at?: string | null
          sent_text?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_tips_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_tips_reviewed_by_fkey"
            columns: ["reviewed_by"]
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
          assigned_to: string | null
          circle_id: string | null
          claimed_at: string | null
          created_at: string | null
          id: string
          is_repeatable: boolean | null
          name: string
          requires_verification: boolean | null
          task_type: string
          zaps_value: number | null
        }
        Insert: {
          assigned_to?: string | null
          circle_id?: string | null
          claimed_at?: string | null
          created_at?: string | null
          id?: string
          is_repeatable?: boolean | null
          name: string
          requires_verification?: boolean | null
          task_type: string
          zaps_value?: number | null
        }
        Update: {
          assigned_to?: string | null
          circle_id?: string | null
          claimed_at?: string | null
          created_at?: string | null
          id?: string
          is_repeatable?: boolean | null
          name?: string
          requires_verification?: boolean | null
          task_type?: string
          zaps_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "crew_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_tasks_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_activities: {
        Row: {
          body: string
          completed_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          deal_id: string | null
          due_at: string | null
          id: string
          kind: string
          space_id: string | null
        }
        Insert: {
          body?: string
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          due_at?: string | null
          id?: string
          kind?: string
          space_id?: string | null
        }
        Update: {
          body?: string
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          due_at?: string | null
          id?: string
          kind?: string
          space_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "crm_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_deals: {
        Row: {
          closed_at: string | null
          contact_id: string | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          currency: string
          expected_close_date: string | null
          id: string
          owner_id: string | null
          profile_id: string | null
          sort_order: number
          source: string | null
          space_id: string | null
          stage_id: string | null
          status: string
          title: string
          updated_at: string
          value: number
        }
        Insert: {
          closed_at?: string | null
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          expected_close_date?: string | null
          id?: string
          owner_id?: string | null
          profile_id?: string | null
          sort_order?: number
          source?: string | null
          space_id?: string | null
          stage_id?: string | null
          status?: string
          title: string
          updated_at?: string
          value?: number
        }
        Update: {
          closed_at?: string | null
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          expected_close_date?: string | null
          id?: string
          owner_id?: string | null
          profile_id?: string | null
          sort_order?: number
          source?: string | null
          space_id?: string | null
          stage_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "crm_deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "crm_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_stages: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
          sort_order: number
          space_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          name: string
          sort_order?: number
          space_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          sort_order?: number
          space_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_stages_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
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
          audience_id: string | null
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
          audience_id?: string | null
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
          audience_id?: string | null
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
          id: string
          reason: string
          space_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          reason: string
          space_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          reason?: string
          space_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_suppressions_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
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
      entities: {
        Row: {
          created_at: string
          id: string
          key: string
          kind: string
          name: string
        }
        Insert: {
          created_at?: string
          id: string
          key: string
          kind: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          kind?: string
          name?: string
        }
        Relationships: []
      }
      entry_campaigns: {
        Row: {
          created_at: string
          goal: string | null
          id: string
          name: string
          owner_profile_id: string | null
          status: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          goal?: string | null
          id?: string
          name: string
          owner_profile_id?: string | null
          status?: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          goal?: string | null
          id?: string
          name?: string
          owner_profile_id?: string | null
          status?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_campaigns_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_point_conversions: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          qr_code_id: string
          variant_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          qr_code_id: string
          variant_key: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          qr_code_id?: string
          variant_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_point_conversions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_point_conversions_qr_code_id_fkey"
            columns: ["qr_code_id"]
            isOneToOne: false
            referencedRelation: "qr_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_point_variants: {
        Row: {
          active: boolean
          created_at: string
          id: string
          label: string
          qr_code_id: string
          target_url: string
          updated_at: string
          variant_key: string
          weight: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          label: string
          qr_code_id: string
          target_url: string
          updated_at?: string
          variant_key: string
          weight?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          label?: string
          qr_code_id?: string
          target_url?: string
          updated_at?: string
          variant_key?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "entry_point_variants_qr_code_id_fkey"
            columns: ["qr_code_id"]
            isOneToOne: false
            referencedRelation: "qr_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_template_settings: {
        Row: {
          enabled: boolean
          template_id: string
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          template_id: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          template_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_blurb_cache: {
        Row: {
          blurb: string | null
          created_at: string
          day_key: string
          event_id: string
          profile_id: string
        }
        Insert: {
          blurb?: string | null
          created_at?: string
          day_key: string
          event_id: string
          profile_id: string
        }
        Update: {
          blurb?: string | null
          created_at?: string
          day_key?: string
          event_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_blurb_cache_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_blurb_cache_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_calendar_follows: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          token: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          token?: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_calendar_follows_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_cohosts: {
        Row: {
          added_by: string | null
          created_at: string
          event_id: string
          id: string
          profile_id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          event_id: string
          id?: string
          profile_id: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          event_id?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_cohosts_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_cohosts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_cohosts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_dispatches: {
        Row: {
          author_id: string
          body: string
          created_at: string
          dispatch_id: string | null
          event_id: string
          id: string
          title: string | null
          to_dispatch: boolean
          to_page: boolean
          to_sms: boolean
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          dispatch_id?: string | null
          event_id: string
          id?: string
          title?: string | null
          to_dispatch?: boolean
          to_page?: boolean
          to_sms?: boolean
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          dispatch_id?: string | null
          event_id?: string
          id?: string
          title?: string | null
          to_dispatch?: boolean
          to_page?: boolean
          to_sms?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "event_dispatches_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_dispatches_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "dispatches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_dispatches_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_embeddings: {
        Row: {
          embedding: string | null
          event_id: string
          updated_at: string
        }
        Insert: {
          embedding?: string | null
          event_id: string
          updated_at?: string
        }
        Update: {
          embedding?: string | null
          event_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_embeddings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_media: {
        Row: {
          caption: string | null
          created_at: string
          event_id: string
          id: string
          image_url: string
          profile_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          event_id: string
          id?: string
          image_url: string
          profile_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          event_id?: string
          id?: string
          image_url?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_media_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_media_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_post_reactions: {
        Row: {
          created_at: string
          id: string
          kind: string
          post_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          post_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          post_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_post_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "event_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_post_reactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_posts: {
        Row: {
          body: string
          created_at: string
          event_id: string
          id: string
          image_url: string | null
          profile_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          event_id: string
          id?: string
          image_url?: string | null
          profile_id: string
        }
        Update: {
          body?: string
          created_at?: string
          event_id?: string
          id?: string
          image_url?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_posts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_posts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_question_answers: {
        Row: {
          answer: string
          created_at: string
          event_id: string
          id: string
          profile_id: string
          question_id: string
          updated_at: string
        }
        Insert: {
          answer?: string
          created_at?: string
          event_id: string
          id?: string
          profile_id: string
          question_id: string
          updated_at?: string
        }
        Update: {
          answer?: string
          created_at?: string
          event_id?: string
          id?: string
          profile_id?: string
          question_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_question_answers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_question_answers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_question_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "event_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      event_questions: {
        Row: {
          created_at: string
          event_id: string
          id: string
          options: Json
          position: number
          prompt: string
          required: boolean
          type: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          options?: Json
          position?: number
          prompt: string
          required?: boolean
          type?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          options?: Json
          position?: number
          prompt?: string
          required?: boolean
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_questions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_rsvps: {
        Row: {
          approval_status: string
          created_at: string | null
          decline_reason: string | null
          event_id: string
          id: string
          muted: boolean
          plus_one_names: Json
          plus_ones: number
          profile_id: string
          reminder_24h_sent_at: string | null
          reminder_2h_sent_at: string | null
          reminder_7d_sent_at: string | null
          status: string
        }
        Insert: {
          approval_status?: string
          created_at?: string | null
          decline_reason?: string | null
          event_id: string
          id?: string
          muted?: boolean
          plus_one_names?: Json
          plus_ones?: number
          profile_id: string
          reminder_24h_sent_at?: string | null
          reminder_2h_sent_at?: string | null
          reminder_7d_sent_at?: string | null
          status: string
        }
        Update: {
          approval_status?: string
          created_at?: string | null
          decline_reason?: string | null
          event_id?: string
          id?: string
          muted?: boolean
          plus_one_names?: Json
          plus_ones?: number
          profile_id?: string
          reminder_24h_sent_at?: string | null
          reminder_2h_sent_at?: string | null
          reminder_7d_sent_at?: string | null
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
      event_ticket_types: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          event_id: string
          id: string
          member_only: boolean
          min_cents: number | null
          name: string
          price_cents: number | null
          pricing_mode: string
          quantity: number | null
          sold: number
          sort_order: number
          suggested_cents: number | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          event_id: string
          id?: string
          member_only?: boolean
          min_cents?: number | null
          name: string
          price_cents?: number | null
          pricing_mode?: string
          quantity?: number | null
          sold?: number
          sort_order?: number
          suggested_cents?: number | null
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          event_id?: string
          id?: string
          member_only?: boolean
          min_cents?: number | null
          name?: string
          price_cents?: number | null
          pricing_mode?: string
          quantity?: number | null
          sold?: number
          sort_order?: number
          suggested_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "event_ticket_types_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_tickets: {
        Row: {
          amount_cents: number
          buyer_profile_id: string | null
          created_at: string
          currency: string
          entity_id: string
          event_id: string
          id: string
          platform_fee_cents: number
          qty: number
          refunded_at: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          succeeded_at: string | null
          ticket_type_id: string | null
        }
        Insert: {
          amount_cents: number
          buyer_profile_id?: string | null
          created_at?: string
          currency?: string
          entity_id?: string
          event_id: string
          id?: string
          platform_fee_cents?: number
          qty?: number
          refunded_at?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          succeeded_at?: string | null
          ticket_type_id?: string | null
        }
        Update: {
          amount_cents?: number
          buyer_profile_id?: string | null
          created_at?: string
          currency?: string
          entity_id?: string
          event_id?: string
          id?: string
          platform_fee_cents?: number
          qty?: number
          refunded_at?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          succeeded_at?: string | null
          ticket_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_tickets_buyer_profile_id_fkey"
            columns: ["buyer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tickets_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tickets_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "event_ticket_types"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          attendance_mode: string
          capacity: number | null
          category: string
          city: string | null
          claim_token: string | null
          claimed_at: string | null
          country: string | null
          cover_image_path: string | null
          created_at: string | null
          currency: string
          description: string | null
          details: Json
          domain_id: string | null
          ends_at: string | null
          energy_tag: string | null
          featured_at: string | null
          geog: unknown
          host_id: string | null
          id: string
          is_cancelled: boolean | null
          is_demo: boolean
          location: string | null
          mux_playback_id: string | null
          mux_stream_id: string | null
          online_url: string | null
          organizer_contact: string | null
          organizer_name: string | null
          parent_event_id: string | null
          postal_code: string | null
          posted_by_profile_id: string | null
          poster_path: string | null
          price_cents: number | null
          published_at: string | null
          recurrence_type: string
          recurrence_until: string | null
          region: string | null
          removed_at: string | null
          removed_reason: string | null
          scope_id: string
          scope_type: string
          slug: string
          source: string
          space_id: string | null
          starts_at: string
          status: string
          street: string | null
          theme: Json
          title: string
          venue_name: string | null
          visibility: string
        }
        Insert: {
          attendance_mode?: string
          capacity?: number | null
          category?: string
          city?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          country?: string | null
          cover_image_path?: string | null
          created_at?: string | null
          currency?: string
          description?: string | null
          details?: Json
          domain_id?: string | null
          ends_at?: string | null
          energy_tag?: string | null
          featured_at?: string | null
          geog?: unknown
          host_id?: string | null
          id?: string
          is_cancelled?: boolean | null
          is_demo?: boolean
          location?: string | null
          mux_playback_id?: string | null
          mux_stream_id?: string | null
          online_url?: string | null
          organizer_contact?: string | null
          organizer_name?: string | null
          parent_event_id?: string | null
          postal_code?: string | null
          posted_by_profile_id?: string | null
          poster_path?: string | null
          price_cents?: number | null
          published_at?: string | null
          recurrence_type?: string
          recurrence_until?: string | null
          region?: string | null
          removed_at?: string | null
          removed_reason?: string | null
          scope_id: string
          scope_type: string
          slug: string
          source?: string
          space_id?: string | null
          starts_at: string
          status?: string
          street?: string | null
          theme?: Json
          title: string
          venue_name?: string | null
          visibility?: string
        }
        Update: {
          attendance_mode?: string
          capacity?: number | null
          category?: string
          city?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          country?: string | null
          cover_image_path?: string | null
          created_at?: string | null
          currency?: string
          description?: string | null
          details?: Json
          domain_id?: string | null
          ends_at?: string | null
          energy_tag?: string | null
          featured_at?: string | null
          geog?: unknown
          host_id?: string | null
          id?: string
          is_cancelled?: boolean | null
          is_demo?: boolean
          location?: string | null
          mux_playback_id?: string | null
          mux_stream_id?: string | null
          online_url?: string | null
          organizer_contact?: string | null
          organizer_name?: string | null
          parent_event_id?: string | null
          postal_code?: string | null
          posted_by_profile_id?: string | null
          poster_path?: string | null
          price_cents?: number | null
          published_at?: string | null
          recurrence_type?: string
          recurrence_until?: string | null
          region?: string | null
          removed_at?: string | null
          removed_reason?: string | null
          scope_id?: string
          scope_type?: string
          slug?: string
          source?: string
          space_id?: string | null
          starts_at?: string
          status?: string
          street?: string | null
          theme?: Json
          title?: string
          venue_name?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "pillars"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "events_posted_by_profile_id_fkey"
            columns: ["posted_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_transactions: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          entity_id: string
          id: string
          idempotency_key: string | null
          occurred_at: string
          profile_id: string | null
          revenue_type: string
          source_id: string | null
          source_table: string | null
          stripe_account_id: string | null
          stripe_payment_intent_id: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          entity_id: string
          id?: string
          idempotency_key?: string | null
          occurred_at?: string
          profile_id?: string | null
          revenue_type: string
          source_id?: string | null
          source_table?: string | null
          stripe_account_id?: string | null
          stripe_payment_intent_id?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          entity_id?: string
          id?: string
          idempotency_key?: string | null
          occurred_at?: string
          profile_id?: string | null
          revenue_type?: string
          source_id?: string | null
          source_table?: string | null
          stripe_account_id?: string | null
          stripe_payment_intent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          circle_id: string | null
          edge_type: string | null
          event_id: string | null
          how_met: string | null
          id: string
          introduced_by: string | null
          met_at: string | null
          met_context: string | null
          requested_at: string
          requested_by: string
          responded_at: string | null
          status: string
          user_a_id: string
          user_b_id: string
        }
        Insert: {
          circle_id?: string | null
          edge_type?: string | null
          event_id?: string | null
          how_met?: string | null
          id?: string
          introduced_by?: string | null
          met_at?: string | null
          met_context?: string | null
          requested_at?: string
          requested_by: string
          responded_at?: string | null
          status?: string
          user_a_id: string
          user_b_id: string
        }
        Update: {
          circle_id?: string | null
          edge_type?: string | null
          event_id?: string | null
          how_met?: string | null
          id?: string
          introduced_by?: string | null
          met_at?: string | null
          met_context?: string | null
          requested_at?: string
          requested_by?: string
          responded_at?: string | null
          status?: string
          user_a_id?: string
          user_b_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_introduced_by_fkey"
            columns: ["introduced_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
      gem_gifts: {
        Row: {
          amount: number
          created_at: string
          giver_id: string
          id: string
          recipient_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          giver_id: string
          id?: string
          recipient_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          giver_id?: string
          id?: string
          recipient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gem_gifts_giver_id_fkey"
            columns: ["giver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gem_gifts_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      help_chunks: {
        Row: {
          category: string
          content: string
          content_hash: string
          embedding: string
          heading: string
          id: string
          slug: string
          updated_at: string
        }
        Insert: {
          category: string
          content: string
          content_hash: string
          embedding: string
          heading?: string
          id?: string
          slug: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          content_hash?: string
          embedding?: string
          heading?: string
          id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      housing_listings: {
        Row: {
          available_from: string | null
          bathrooms: number | null
          bedrooms: number | null
          deposit_cents: number | null
          furnished: boolean | null
          household_size: number | null
          lease_months: number | null
          listing_id: string
          listing_type: string
          pets_ok: boolean | null
          preferences: Json
          rent_cents: number | null
          room_type: string | null
          utilities_included: boolean | null
        }
        Insert: {
          available_from?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          deposit_cents?: number | null
          furnished?: boolean | null
          household_size?: number | null
          lease_months?: number | null
          listing_id: string
          listing_type: string
          pets_ok?: boolean | null
          preferences?: Json
          rent_cents?: number | null
          room_type?: string | null
          utilities_included?: boolean | null
        }
        Update: {
          available_from?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          deposit_cents?: number | null
          furnished?: boolean | null
          household_size?: number | null
          lease_months?: number | null
          listing_id?: string
          listing_type?: string
          pets_ok?: boolean | null
          preferences?: Json
          rent_cents?: number | null
          room_type?: string | null
          utilities_included?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "housing_listings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      housing_seeker_profiles: {
        Row: {
          active: boolean
          budget_max_cents: number | null
          budget_min_cents: number | null
          created_at: string
          move_in_from: string | null
          preferences: Json
          profile_id: string
          search_city: string | null
          search_lat: number | null
          search_lng: number | null
          search_radius_m: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          budget_max_cents?: number | null
          budget_min_cents?: number | null
          created_at?: string
          move_in_from?: string | null
          preferences?: Json
          profile_id: string
          search_city?: string | null
          search_lat?: number | null
          search_lng?: number | null
          search_radius_m?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          budget_max_cents?: number | null
          budget_min_cents?: number | null
          created_at?: string
          move_in_from?: string | null
          preferences?: Json
          profile_id?: string
          search_city?: string | null
          search_lat?: number | null
          search_lng?: number | null
          search_radius_m?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "housing_seeker_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
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
          is_demo: boolean
          name: string
          nexus_id: string | null
          slug: string
          status: Database["public"]["Enums"]["group_status"]
        }
        Insert: {
          created_at?: string | null
          guide_id?: string | null
          id?: string
          is_demo?: boolean
          name: string
          nexus_id?: string | null
          slug: string
          status?: Database["public"]["Enums"]["group_status"]
        }
        Update: {
          created_at?: string | null
          guide_id?: string | null
          id?: string
          is_demo?: boolean
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
      interaction_events: {
        Row: {
          created_at: string
          id: number
          kind: string
          occurred_at: string
          path: string | null
          profile_id: string | null
          props: Json
          session_id: string | null
          surface: string | null
        }
        Insert: {
          created_at?: string
          id?: never
          kind: string
          occurred_at?: string
          path?: string | null
          profile_id?: string | null
          props?: Json
          session_id?: string | null
          surface?: string | null
        }
        Update: {
          created_at?: string
          id?: never
          kind?: string
          occurred_at?: string
          path?: string | null
          profile_id?: string | null
          props?: Json
          session_id?: string | null
          surface?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interaction_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      introductions: {
        Row: {
          connected_at: string | null
          created_at: string
          id: string
          introducer_id: string
          note: string | null
          person_a_id: string
          person_b_id: string
          rewarded: boolean
          status: string
        }
        Insert: {
          connected_at?: string | null
          created_at?: string
          id?: string
          introducer_id: string
          note?: string | null
          person_a_id: string
          person_b_id: string
          rewarded?: boolean
          status?: string
        }
        Update: {
          connected_at?: string | null
          created_at?: string
          id?: string
          introducer_id?: string
          note?: string | null
          person_a_id?: string
          person_b_id?: string
          rewarded?: boolean
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "introductions_introducer_id_fkey"
            columns: ["introducer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "introductions_person_a_id_fkey"
            columns: ["person_a_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "introductions_person_b_id_fkey"
            columns: ["person_b_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      journey_completions: {
        Row: {
          completed_at: string
          id: string
          journey_id: string
          profile_id: string
          season: number
        }
        Insert: {
          completed_at?: string
          id?: string
          journey_id: string
          profile_id: string
          season: number
        }
        Update: {
          completed_at?: string
          id?: string
          journey_id?: string
          profile_id?: string
          season?: number
        }
        Relationships: [
          {
            foreignKeyName: "journey_completions_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journey_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_completions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_enrollments: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          plan_id: string
          profile_id: string
          run_id: string | null
          started_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          plan_id: string
          profile_id: string
          run_id?: string | null
          started_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          plan_id?: string
          profile_id?: string
          run_id?: string | null
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journey_enrollments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "journey_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_enrollments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_enrollments_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "journey_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_lesson_progress: {
        Row: {
          completed_at: string
          id: string
          item_id: string
          last_position: number | null
          plan_id: string
          profile_id: string
        }
        Insert: {
          completed_at?: string
          id?: string
          item_id: string
          last_position?: number | null
          plan_id: string
          profile_id: string
        }
        Update: {
          completed_at?: string
          id?: string
          item_id?: string
          last_position?: number | null
          plan_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journey_lesson_progress_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "journey_plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_lesson_progress_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "journey_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_lesson_progress_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_phase_events: {
        Row: {
          created_at: string
          event_id: string
          id: string
          kind: string
          phase_id: string
          run_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          kind: string
          phase_id: string
          run_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          kind?: string
          phase_id?: string
          run_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journey_phase_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_phase_events_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "journey_plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_phase_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "journey_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_plan_adoptions: {
        Row: {
          active: boolean
          adopted_at: string
          id: string
          plan_id: string
          profile_id: string
        }
        Insert: {
          active?: boolean
          adopted_at?: string
          id?: string
          plan_id: string
          profile_id: string
        }
        Update: {
          active?: boolean
          adopted_at?: string
          id?: string
          plan_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journey_plan_adoptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "journey_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_plan_adoptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_plan_items: {
        Row: {
          block_type: string
          body: string | null
          cadence: string | null
          domain_id: string | null
          est_minutes: number | null
          id: string
          media: Json
          note: string | null
          parent_id: string | null
          plan_id: string
          practice_id: string | null
          required: boolean
          settings: Json
          sort_order: number
          title: string | null
        }
        Insert: {
          block_type?: string
          body?: string | null
          cadence?: string | null
          domain_id?: string | null
          est_minutes?: number | null
          id?: string
          media?: Json
          note?: string | null
          parent_id?: string | null
          plan_id: string
          practice_id?: string | null
          required?: boolean
          settings?: Json
          sort_order?: number
          title?: string | null
        }
        Update: {
          block_type?: string
          body?: string | null
          cadence?: string | null
          domain_id?: string | null
          est_minutes?: number | null
          id?: string
          media?: Json
          note?: string | null
          parent_id?: string | null
          plan_id?: string
          practice_id?: string | null
          required?: boolean
          settings?: Json
          sort_order?: number
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journey_plan_items_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "pillars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_plan_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "journey_plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "journey_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_plan_items_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_plan_items_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices_ranked"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_plans: {
        Row: {
          accent: string | null
          adopt_count: number
          author_id: string | null
          category: string | null
          certificate_enabled: boolean
          completion_gems: number
          cover_image: string | null
          created_at: string
          daily_minutes: number | null
          difficulty: string | null
          drip_interval_days: number
          emoji: string | null
          enroll_cap: number | null
          featured_at: string | null
          fork_of: string | null
          forked_count: number
          id: string
          intro: string | null
          intro_video: string | null
          meeting: Json
          official: boolean
          page_config: Json | null
          published_at: string | null
          quest_id: string | null
          ranked_eligible: boolean
          reviewed_at: string | null
          reviewed_by: string | null
          sequential: boolean
          slug: string
          source_overview: string | null
          space_id: string | null
          status: string
          summary: string | null
          tags: string[]
          title: string
          updated_at: string
          vera_review: Json | null
          visibility: string
          window_ends_at: string | null
          window_starts_at: string | null
        }
        Insert: {
          accent?: string | null
          adopt_count?: number
          author_id?: string | null
          category?: string | null
          certificate_enabled?: boolean
          completion_gems?: number
          cover_image?: string | null
          created_at?: string
          daily_minutes?: number | null
          difficulty?: string | null
          drip_interval_days?: number
          emoji?: string | null
          enroll_cap?: number | null
          featured_at?: string | null
          fork_of?: string | null
          forked_count?: number
          id?: string
          intro?: string | null
          intro_video?: string | null
          meeting?: Json
          official?: boolean
          page_config?: Json | null
          published_at?: string | null
          quest_id?: string | null
          ranked_eligible?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          sequential?: boolean
          slug: string
          source_overview?: string | null
          space_id?: string | null
          status?: string
          summary?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          vera_review?: Json | null
          visibility?: string
          window_ends_at?: string | null
          window_starts_at?: string | null
        }
        Update: {
          accent?: string | null
          adopt_count?: number
          author_id?: string | null
          category?: string | null
          certificate_enabled?: boolean
          completion_gems?: number
          cover_image?: string | null
          created_at?: string
          daily_minutes?: number | null
          difficulty?: string | null
          drip_interval_days?: number
          emoji?: string | null
          enroll_cap?: number | null
          featured_at?: string | null
          fork_of?: string | null
          forked_count?: number
          id?: string
          intro?: string | null
          intro_video?: string | null
          meeting?: Json
          official?: boolean
          page_config?: Json | null
          published_at?: string | null
          quest_id?: string | null
          ranked_eligible?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          sequential?: boolean
          slug?: string
          source_overview?: string | null
          space_id?: string | null
          status?: string
          summary?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          vera_review?: Json | null
          visibility?: string
          window_ends_at?: string | null
          window_starts_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journey_plans_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_plans_fork_of_fkey"
            columns: ["fork_of"]
            isOneToOne: false
            referencedRelation: "journey_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_plans_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "quests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_plans_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_plans_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_runs: {
        Row: {
          circle_id: string
          created_at: string
          drip_interval_days: number
          host_id: string | null
          id: string
          kickoff_event_id: string | null
          plan_id: string
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          circle_id: string
          created_at?: string
          drip_interval_days?: number
          host_id?: string | null
          id?: string
          kickoff_event_id?: string | null
          plan_id: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          circle_id?: string
          created_at?: string
          drip_interval_days?: number
          host_id?: string | null
          id?: string
          kickoff_event_id?: string | null
          plan_id?: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journey_runs_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_runs_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_runs_kickoff_event_id_fkey"
            columns: ["kickoff_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_runs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "journey_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_saves: {
        Row: {
          created_at: string
          listing_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          listing_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          listing_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_saves_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_saves_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          category: string | null
          circle_id: string | null
          city: string | null
          created_at: string
          description: string | null
          entity_id: string
          geocell_lat: number | null
          geocell_lng: number | null
          id: string
          images: string[]
          is_demo: boolean
          latitude: number | null
          longitude: number | null
          neighborhood: string | null
          owner_profile_id: string | null
          price_note: string | null
          status: string
          title: string
          updated_at: string
          vertical: string
        }
        Insert: {
          category?: string | null
          circle_id?: string | null
          city?: string | null
          created_at?: string
          description?: string | null
          entity_id: string
          geocell_lat?: number | null
          geocell_lng?: number | null
          id?: string
          images?: string[]
          is_demo?: boolean
          latitude?: number | null
          longitude?: number | null
          neighborhood?: string | null
          owner_profile_id?: string | null
          price_note?: string | null
          status?: string
          title: string
          updated_at?: string
          vertical: string
        }
        Update: {
          category?: string | null
          circle_id?: string | null
          city?: string | null
          created_at?: string
          description?: string | null
          entity_id?: string
          geocell_lat?: number | null
          geocell_lng?: number | null
          id?: string
          images?: string[]
          is_demo?: boolean
          latitude?: number | null
          longitude?: number | null
          neighborhood?: string | null
          owner_profile_id?: string | null
          price_note?: string | null
          status?: string
          title?: string
          updated_at?: string
          vertical?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      market_listings: {
        Row: {
          author_id: string | null
          category: string | null
          circle_id: string | null
          city: string | null
          created_at: string
          description: string | null
          id: string
          images: string[]
          is_demo: boolean
          kind: string
          latitude: number | null
          longitude: number | null
          neighborhood: string | null
          price_note: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          category?: string | null
          circle_id?: string | null
          city?: string | null
          created_at?: string
          description?: string | null
          id?: string
          images?: string[]
          is_demo?: boolean
          kind?: string
          latitude?: number | null
          longitude?: number | null
          neighborhood?: string | null
          price_note?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          category?: string | null
          circle_id?: string | null
          city?: string | null
          created_at?: string
          description?: string | null
          id?: string
          images?: string[]
          is_demo?: boolean
          kind?: string
          latitude?: number | null
          longitude?: number | null
          neighborhood?: string | null
          price_note?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_listings_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_listings_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_reports: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          reason: string
          reporter_id: string | null
          status: string
          target_id: string
          target_kind: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          reason: string
          reporter_id?: string | null
          status?: string
          target_id: string
          target_kind: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          reason?: string
          reporter_id?: string | null
          status?: string
          target_id?: string
          target_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_reports_reporter_id_fkey"
            columns: ["reporter_id"]
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
            foreignKeyName: "member_practices_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices_ranked"
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
      member_tags: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          context: Json
          created_at: string
          expires_at: string | null
          id: string
          profile_id: string
          source: string
          tag_key: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          context?: Json
          created_at?: string
          expires_at?: string | null
          id?: string
          profile_id: string
          source?: string
          tag_key: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          context?: Json
          created_at?: string
          expires_at?: string | null
          id?: string
          profile_id?: string
          source?: string
          tag_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_tags_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_tags_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      member_traits: {
        Row: {
          computed_at: string
          profile_id: string
          trait_key: string
          value_bool: boolean | null
          value_json: Json | null
          value_num: number | null
          value_text: string | null
          value_ts: string | null
        }
        Insert: {
          computed_at?: string
          profile_id: string
          trait_key: string
          value_bool?: boolean | null
          value_json?: Json | null
          value_num?: number | null
          value_text?: string | null
          value_ts?: string | null
        }
        Update: {
          computed_at?: string
          profile_id?: string
          trait_key?: string
          value_bool?: boolean | null
          value_json?: Json | null
          value_num?: number | null
          value_text?: string | null
          value_ts?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_traits_profile_id_fkey"
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
      menu_categories: {
        Row: {
          blurb: string | null
          col_span: number
          created_at: string
          grid_col: number | null
          grid_row: number | null
          icon: string | null
          id: string
          label: string | null
          menu_id: string
          min_access: string
          parent_id: string | null
          position: number
          staff_domain: string | null
          staff_level: string | null
          updated_at: string
        }
        Insert: {
          blurb?: string | null
          col_span?: number
          created_at?: string
          grid_col?: number | null
          grid_row?: number | null
          icon?: string | null
          id?: string
          label?: string | null
          menu_id: string
          min_access?: string
          parent_id?: string | null
          position?: number
          staff_domain?: string | null
          staff_level?: string | null
          updated_at?: string
        }
        Update: {
          blurb?: string | null
          col_span?: number
          created_at?: string
          grid_col?: number | null
          grid_row?: number | null
          icon?: string | null
          id?: string
          label?: string | null
          menu_id?: string
          min_access?: string
          parent_id?: string | null
          position?: number
          staff_domain?: string | null
          staff_level?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_config: {
        Row: {
          area_key: string
          hidden: boolean
          position: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          area_key: string
          hidden?: boolean
          position?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          area_key?: string
          hidden?: boolean
          position?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          category_id: string | null
          col_span: number
          created_at: string
          ghost_message: string | null
          ghost_tier: string | null
          grid_col: number | null
          grid_row: number | null
          href: string
          icon: string | null
          id: string
          label: string
          menu_id: string
          min_access: string
          mode: string
          position: number
          role_modes: Json
          staff_domain: string | null
          staff_level: string | null
          subheading: string | null
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          col_span?: number
          created_at?: string
          ghost_message?: string | null
          ghost_tier?: string | null
          grid_col?: number | null
          grid_row?: number | null
          href: string
          icon?: string | null
          id?: string
          label: string
          menu_id: string
          min_access?: string
          mode?: string
          position?: number
          role_modes?: Json
          staff_domain?: string | null
          staff_level?: string | null
          subheading?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          col_span?: number
          created_at?: string
          ghost_message?: string | null
          ghost_tier?: string | null
          grid_col?: number | null
          grid_row?: number | null
          href?: string
          icon?: string | null
          id?: string
          label?: string
          menu_id?: string
          min_access?: string
          mode?: string
          position?: number
          role_modes?: Json
          staff_domain?: string | null
          staff_level?: string | null
          subheading?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_rail_cards: {
        Row: {
          body: string
          created_at: string
          cta: string | null
          href: string
          id: string
          menu_id: string
          mode: string
          position: number
          role_modes: Json
          side: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          cta?: string | null
          href: string
          id?: string
          menu_id: string
          mode?: string
          position?: number
          role_modes?: Json
          side: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          cta?: string | null
          href?: string
          id?: string
          menu_id?: string
          mode?: string
          position?: number
          role_modes?: Json
          side?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_rail_cards_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_settings: {
        Row: {
          dwell_ms: number
          fade_ms: number
          id: number
          open_delay_ms: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          dwell_ms?: number
          fade_ms?: number
          id?: number
          open_delay_ms?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          dwell_ms?: number
          fade_ms?: number
          id?: number
          open_delay_ms?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      menus: {
        Row: {
          columns: number
          created_at: string
          id: string
          label: string
          space_id: string | null
          surface_key: string
          synced_default_keys: Json
          updated_at: string
        }
        Insert: {
          columns?: number
          created_at?: string
          id?: string
          label: string
          space_id?: string | null
          surface_key: string
          synced_default_keys?: Json
          updated_at?: string
        }
        Update: {
          columns?: number
          created_at?: string
          id?: string
          label?: string
          space_id?: string | null
          surface_key?: string
          synced_default_keys?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menus_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
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
      network_contact_notes: {
        Row: {
          author_id: string | null
          body: string
          contact_id: string
          created_at: string
          id: string
          kind: string
        }
        Insert: {
          author_id?: string | null
          body: string
          contact_id: string
          created_at?: string
          id?: string
          kind?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          contact_id?: string
          created_at?: string
          id?: string
          kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "network_contact_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_contact_notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "network_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      network_contact_reminders: {
        Row: {
          contact_id: string
          created_at: string
          done_at: string | null
          due_at: string
          id: string
          note: string | null
          owner_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          done_at?: string | null
          due_at: string
          id?: string
          note?: string | null
          owner_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          done_at?: string | null
          due_at?: string
          id?: string
          note?: string | null
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "network_contact_reminders_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "network_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_contact_reminders_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      network_contact_tags: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          source: string
          tag: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          source?: string
          tag: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          source?: string
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "network_contact_tags_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "network_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      network_contacts: {
        Row: {
          avatar_path: string | null
          card_back_path: string | null
          card_front_path: string | null
          city: string | null
          company: string | null
          created_at: string
          details: Json
          display_name: string | null
          email: string | null
          extraction: Json
          id: string
          invited_at: string | null
          last_contacted_at: string | null
          linked_contact_id: string | null
          linked_profile_id: string | null
          logo_path: string | null
          match_dismissed: boolean
          owner_id: string
          phone: string | null
          socials: Json
          source: string
          status: string
          title: string | null
          updated_at: string
          visibility: string
          website: string | null
        }
        Insert: {
          avatar_path?: string | null
          card_back_path?: string | null
          card_front_path?: string | null
          city?: string | null
          company?: string | null
          created_at?: string
          details?: Json
          display_name?: string | null
          email?: string | null
          extraction?: Json
          id?: string
          invited_at?: string | null
          last_contacted_at?: string | null
          linked_contact_id?: string | null
          linked_profile_id?: string | null
          logo_path?: string | null
          match_dismissed?: boolean
          owner_id: string
          phone?: string | null
          socials?: Json
          source?: string
          status?: string
          title?: string | null
          updated_at?: string
          visibility?: string
          website?: string | null
        }
        Update: {
          avatar_path?: string | null
          card_back_path?: string | null
          card_front_path?: string | null
          city?: string | null
          company?: string | null
          created_at?: string
          details?: Json
          display_name?: string | null
          email?: string | null
          extraction?: Json
          id?: string
          invited_at?: string | null
          last_contacted_at?: string | null
          linked_contact_id?: string | null
          linked_profile_id?: string | null
          logo_path?: string | null
          match_dismissed?: boolean
          owner_id?: string
          phone?: string | null
          socials?: Json
          source?: string
          status?: string
          title?: string | null
          updated_at?: string
          visibility?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "network_contacts_linked_contact_id_fkey"
            columns: ["linked_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_contacts_linked_profile_id_fkey"
            columns: ["linked_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_contacts_owner_id_fkey"
            columns: ["owner_id"]
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
          city: string | null
          created_at: string
          id: string
          kind: string
          label: string | null
          location: unknown
          max_claims: number | null
          owner_profile_id: string | null
          partner_id: string | null
          proximity_m: number | null
          reward_event_type: string | null
          secret: string | null
          space_id: string | null
          style: Json
          type: string
          valid_from: string | null
          valid_until: string | null
          zaps_value: number
        }
        Insert: {
          active?: boolean
          capture_rule?: string
          city?: string | null
          created_at?: string
          id?: string
          kind?: string
          label?: string | null
          location?: unknown
          max_claims?: number | null
          owner_profile_id?: string | null
          partner_id?: string | null
          proximity_m?: number | null
          reward_event_type?: string | null
          secret?: string | null
          space_id?: string | null
          style?: Json
          type: string
          valid_from?: string | null
          valid_until?: string | null
          zaps_value?: number
        }
        Update: {
          active?: boolean
          capture_rule?: string
          city?: string | null
          created_at?: string
          id?: string
          kind?: string
          label?: string | null
          location?: unknown
          max_claims?: number | null
          owner_profile_id?: string | null
          partner_id?: string | null
          proximity_m?: number | null
          reward_event_type?: string | null
          secret?: string | null
          space_id?: string | null
          style?: Json
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
          {
            foreignKeyName: "nodes_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
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
      nurture_enrollments: {
        Row: {
          contact_id: string
          created_at: string
          email: string
          enrolled_at: string
          id: string
          last_sent_at: string | null
          next_run_at: string
          next_step_order: number
          persona: string
          sequence_id: string
          status: string
          updated_at: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          email: string
          enrolled_at?: string
          id?: string
          last_sent_at?: string | null
          next_run_at?: string
          next_step_order?: number
          persona: string
          sequence_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          email?: string
          enrolled_at?: string
          id?: string
          last_sent_at?: string | null
          next_run_at?: string
          next_step_order?: number
          persona?: string
          sequence_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nurture_enrollments_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "nurture_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      nurture_sequences: {
        Row: {
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          name: string
          persona: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          name: string
          persona: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          name?: string
          persona?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nurture_sequences_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nurture_steps: {
        Row: {
          body: string
          created_at: string
          delay_hours: number
          enabled: boolean
          id: string
          sequence_id: string
          step_order: number
          subject: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          delay_hours?: number
          enabled?: boolean
          id?: string
          sequence_id: string
          step_order?: number
          subject: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          delay_hours?: number
          enabled?: boolean
          id?: string
          sequence_id?: string
          step_order?: number
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nurture_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "nurture_sequences"
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
      outreach_sends: {
        Row: {
          campaign_id: string | null
          contact_id: string | null
          created_at: string
          email: string
          error: string | null
          id: string
          resend_id: string | null
          space_id: string
          status: string
          updated_at: string
        }
        Insert: {
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string
          email: string
          error?: string | null
          id?: string
          resend_id?: string | null
          space_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string
          email?: string
          error?: string | null
          id?: string
          resend_id?: string | null
          space_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_sends_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_sends_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_sends_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      page_chrome_overrides: {
        Row: {
          note: string | null
          rail: string
          route: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          note?: string | null
          rail: string
          route: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          note?: string | null
          rail?: string
          route?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "page_chrome_overrides_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      page_content: {
        Row: {
          cta_href: string | null
          cta_label: string | null
          description: string | null
          hero_image: string | null
          route: string
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cta_href?: string | null
          cta_label?: string | null
          description?: string | null
          hero_image?: string | null
          route: string
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cta_href?: string | null
          cta_label?: string | null
          description?: string | null
          hero_image?: string | null
          route?: string
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "page_content_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      page_settings: {
        Row: {
          header_image_url: string | null
          layout: Json | null
          og_image_url: string | null
          route: string
          seo_description: string | null
          seo_title: string | null
          space_id: string
          status: string
          updated_at: string
          updated_by: string | null
          visibility_role: string | null
        }
        Insert: {
          header_image_url?: string | null
          layout?: Json | null
          og_image_url?: string | null
          route: string
          seo_description?: string | null
          seo_title?: string | null
          space_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          visibility_role?: string | null
        }
        Update: {
          header_image_url?: string | null
          layout?: Json | null
          og_image_url?: string | null
          route?: string
          seo_description?: string | null
          seo_title?: string | null
          space_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          visibility_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "page_settings_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          space_id: string | null
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
          space_id?: string | null
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
          space_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pages_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
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
      pillars: {
        Row: {
          accent: string | null
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
          accent?: string | null
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
          accent?: string | null
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
      platform_flag_events: {
        Row: {
          changed_by: string | null
          created_at: string
          flag_key: string
          id: string
          previous: boolean | null
          source: string
          value: boolean
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          flag_key: string
          id?: string
          previous?: boolean | null
          source?: string
          value: boolean
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          flag_key?: string
          id?: string
          previous?: boolean | null
          source?: string
          value?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "platform_flag_events_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_flags: {
        Row: {
          key: string
          updated_at: string | null
          value: boolean
        }
        Insert: {
          key: string
          updated_at?: string | null
          value?: boolean
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: boolean
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      playbook_runs: {
        Row: {
          actor_profile_id: string | null
          ended_at: string | null
          id: string
          outcome: string | null
          playbook_id: string
          space_id: string | null
          started_at: string
          status: string
          subject_id: string
          subject_kind: string
        }
        Insert: {
          actor_profile_id?: string | null
          ended_at?: string | null
          id?: string
          outcome?: string | null
          playbook_id: string
          space_id?: string | null
          started_at?: string
          status?: string
          subject_id: string
          subject_kind: string
        }
        Update: {
          actor_profile_id?: string | null
          ended_at?: string | null
          id?: string
          outcome?: string | null
          playbook_id?: string
          space_id?: string | null
          started_at?: string
          status?: string
          subject_id?: string
          subject_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "playbook_runs_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbook_runs_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      playbooks: {
        Row: {
          action_sequence: Json
          autonomy_tier: string
          created_at: string
          id: string
          slug: string
          space_id: string | null
          trigger_signal: string
          updated_at: string
        }
        Insert: {
          action_sequence?: Json
          autonomy_tier?: string
          created_at?: string
          id?: string
          slug: string
          space_id?: string | null
          trigger_signal: string
          updated_at?: string
        }
        Update: {
          action_sequence?: Json
          autonomy_tier?: string
          created_at?: string
          id?: string
          slug?: string
          space_id?: string | null
          trigger_signal?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "playbooks_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
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
          featured_at: string | null
          hidden_at: string | null
          hidden_by: string | null
          id: string
          is_demo: boolean
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
          featured_at?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          is_demo?: boolean
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
          featured_at?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          is_demo?: boolean
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
          completed: boolean
          created_at: string
          id: string
          logged_for: string
          practice_id: string | null
          profile_id: string
          seconds_done: number | null
          seconds_target: number | null
          zaps_awarded: number | null
        }
        Insert: {
          circle_id?: string | null
          completed?: boolean
          created_at?: string
          id?: string
          logged_for?: string
          practice_id?: string | null
          profile_id: string
          seconds_done?: number | null
          seconds_target?: number | null
          zaps_awarded?: number | null
        }
        Update: {
          circle_id?: string | null
          completed?: boolean
          created_at?: string
          id?: string
          logged_for?: string
          practice_id?: string | null
          profile_id?: string
          seconds_done?: number | null
          seconds_target?: number | null
          zaps_awarded?: number | null
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
            foreignKeyName: "practice_logs_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices_ranked"
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
      practice_sessions: {
        Row: {
          ended_at: string
          id: string
          mode: string
          pattern: string | null
          practice_id: string | null
          profile_id: string
          seconds: number
          started_at: string | null
        }
        Insert: {
          ended_at?: string
          id?: string
          mode?: string
          pattern?: string | null
          practice_id?: string | null
          profile_id: string
          seconds?: number
          started_at?: string | null
        }
        Update: {
          ended_at?: string
          id?: string
          mode?: string
          pattern?: string | null
          practice_id?: string | null
          profile_id?: string
          seconds?: number
          started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "practice_sessions_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_sessions_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices_ranked"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_sessions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_subcategories: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          domain_id: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          domain_id: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          domain_id?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_subcategories_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "pillars"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_tag_defs: {
        Row: {
          created_at: string
          created_by: string | null
          domain_id: string | null
          id: string
          is_canonical: boolean
          label: string
          slug: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          domain_id?: string | null
          id?: string
          is_canonical?: boolean
          label: string
          slug: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          domain_id?: string | null
          id?: string
          is_canonical?: boolean
          label?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_tag_defs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_tag_defs_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "pillars"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_tags: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          practice_id: string
          source: string
          tag_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          practice_id: string
          source?: string
          tag_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          practice_id?: string
          source?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_tags_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_tags_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_tags_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices_ranked"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "practice_tag_defs"
            referencedColumns: ["id"]
          },
        ]
      }
      practices: {
        Row: {
          body: string | null
          cadence: string | null
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          domain_id: string | null
          duration_locked: boolean
          duration_min: number | null
          embedding: string | null
          featured_at: string | null
          focus_details: Json
          header_image: string | null
          icon: string
          id: string
          is_demo: boolean
          is_public: boolean
          is_template: boolean
          mindless_mode:
            | Database["public"]["Enums"]["practice_mindless_mode"]
            | null
          movement_config: Json | null
          reviewed_at: string | null
          reviewed_by: string | null
          reward_note: string | null
          reward_zaps: number | null
          slug: string | null
          space_id: string | null
          status: string
          subcategory_id: string | null
          summary: string | null
          timer_kind: Database["public"]["Enums"]["practice_timer_kind"]
          title: string
          uses_timer: boolean | null
          weight_class: string
        }
        Insert: {
          body?: string | null
          cadence?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          domain_id?: string | null
          duration_locked?: boolean
          duration_min?: number | null
          embedding?: string | null
          featured_at?: string | null
          focus_details?: Json
          header_image?: string | null
          icon?: string
          id?: string
          is_demo?: boolean
          is_public?: boolean
          is_template?: boolean
          mindless_mode?:
            | Database["public"]["Enums"]["practice_mindless_mode"]
            | null
          movement_config?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reward_note?: string | null
          reward_zaps?: number | null
          slug?: string | null
          space_id?: string | null
          status?: string
          subcategory_id?: string | null
          summary?: string | null
          timer_kind?: Database["public"]["Enums"]["practice_timer_kind"]
          title: string
          uses_timer?: boolean | null
          weight_class?: string
        }
        Update: {
          body?: string | null
          cadence?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          domain_id?: string | null
          duration_locked?: boolean
          duration_min?: number | null
          embedding?: string | null
          featured_at?: string | null
          focus_details?: Json
          header_image?: string | null
          icon?: string
          id?: string
          is_demo?: boolean
          is_public?: boolean
          is_template?: boolean
          mindless_mode?:
            | Database["public"]["Enums"]["practice_mindless_mode"]
            | null
          movement_config?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reward_note?: string | null
          reward_zaps?: number | null
          slug?: string | null
          space_id?: string | null
          status?: string
          subcategory_id?: string | null
          summary?: string | null
          timer_kind?: Database["public"]["Enums"]["practice_timer_kind"]
          title?: string
          uses_timer?: boolean | null
          weight_class?: string
        }
        Relationships: [
          {
            foreignKeyName: "practices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practices_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "pillars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practices_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practices_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practices_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "practice_subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_feature_gates: {
        Row: {
          enabled: boolean
          feature: string
          min_entitlement: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          feature: string
          min_entitlement?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          feature?: string
          min_entitlement?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_feature_gates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "pricing_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_stripe_prices: {
        Row: {
          archived: boolean
          key: string
          stripe_price_id: string | null
          stripe_product_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived?: boolean
          key: string
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived?: boolean
          key?: string
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_stripe_prices_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_personas: {
        Row: {
          created_at: string
          entity_id: string | null
          id: string
          notes: string | null
          persona: string
          profile_id: string
          state: string
          stripe_account_id: string | null
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          id?: string
          notes?: string | null
          persona: string
          profile_id: string
          state?: string
          stripe_account_id?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          id?: string
          notes?: string | null
          persona?: string
          profile_id?: string
          state?: string
          stripe_account_id?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_personas_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_personas_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_personas_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          achievement_count: number
          acquisition: Json | null
          amplitude: number
          auth_user_id: string | null
          avatar_url: string | null
          bio: string | null
          city: string | null
          community_level: string
          community_role: Database["public"]["Enums"]["community_role"] | null
          created_at: string | null
          current_season_rank: Database["public"]["Enums"]["season_rank_enum"]
          current_season_zaps: number
          current_streak: number
          custom_title: string | null
          directory_visible: boolean
          discoverable_by: string
          discovery_radius_m: number
          display_name: string
          embedding: string | null
          entity_types: string[] | null
          feed_radius_m: number
          gamification_access_override: string | null
          ghost_mode: boolean
          handle: string
          header_image_url: string | null
          home_geocell_lat: number | null
          home_geocell_lng: number | null
          home_geog: unknown
          home_label: string | null
          home_lat: number | null
          home_lng: number | null
          home_timezone: string | null
          household_bundle_id: string | null
          id: string
          is_active: boolean | null
          is_crew_lead: boolean | null
          is_demo: boolean
          is_founding_member: boolean
          is_system: boolean
          last_seen_at: string | null
          lifetime_gems: number
          lifetime_rank: Database["public"]["Enums"]["season_rank_enum"]
          lifetime_zaps: number
          live_lat: number | null
          live_lng: number | null
          live_updated_at: string | null
          location_band: string
          location_mode: string
          locked_price_id: string | null
          longest_streak: number
          membership_payment_status: string | null
          membership_tier: string
          meta: Json | null
          nexus_region_id: string | null
          phone: string | null
          profile_border: string | null
          profile_flair: string | null
          profile_theme: string | null
          referred_by_profile_id: string | null
          stripe_account_id: string | null
          stripe_charges_enabled: boolean
          stripe_customer_id: string | null
          stripe_details_submitted: boolean
          stripe_payouts_enabled: boolean
          suspended_at: string | null
          suspended_by: string | null
          suspended_reason: string | null
          suspended_until: string | null
          updated_at: string | null
          vcard: Json
          web_role: string
          website: string | null
        }
        Insert: {
          achievement_count?: number
          acquisition?: Json | null
          amplitude?: number
          auth_user_id?: string | null
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          community_level?: string
          community_role?: Database["public"]["Enums"]["community_role"] | null
          created_at?: string | null
          current_season_rank?: Database["public"]["Enums"]["season_rank_enum"]
          current_season_zaps?: number
          current_streak?: number
          custom_title?: string | null
          directory_visible?: boolean
          discoverable_by?: string
          discovery_radius_m?: number
          display_name: string
          embedding?: string | null
          entity_types?: string[] | null
          feed_radius_m?: number
          gamification_access_override?: string | null
          ghost_mode?: boolean
          handle: string
          header_image_url?: string | null
          home_geocell_lat?: number | null
          home_geocell_lng?: number | null
          home_geog?: unknown
          home_label?: string | null
          home_lat?: number | null
          home_lng?: number | null
          home_timezone?: string | null
          household_bundle_id?: string | null
          id?: string
          is_active?: boolean | null
          is_crew_lead?: boolean | null
          is_demo?: boolean
          is_founding_member?: boolean
          is_system?: boolean
          last_seen_at?: string | null
          lifetime_gems?: number
          lifetime_rank?: Database["public"]["Enums"]["season_rank_enum"]
          lifetime_zaps?: number
          live_lat?: number | null
          live_lng?: number | null
          live_updated_at?: string | null
          location_band?: string
          location_mode?: string
          locked_price_id?: string | null
          longest_streak?: number
          membership_payment_status?: string | null
          membership_tier?: string
          meta?: Json | null
          nexus_region_id?: string | null
          phone?: string | null
          profile_border?: string | null
          profile_flair?: string | null
          profile_theme?: string | null
          referred_by_profile_id?: string | null
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean
          stripe_customer_id?: string | null
          stripe_details_submitted?: boolean
          stripe_payouts_enabled?: boolean
          suspended_at?: string | null
          suspended_by?: string | null
          suspended_reason?: string | null
          suspended_until?: string | null
          updated_at?: string | null
          vcard?: Json
          web_role?: string
          website?: string | null
        }
        Update: {
          achievement_count?: number
          acquisition?: Json | null
          amplitude?: number
          auth_user_id?: string | null
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          community_level?: string
          community_role?: Database["public"]["Enums"]["community_role"] | null
          created_at?: string | null
          current_season_rank?: Database["public"]["Enums"]["season_rank_enum"]
          current_season_zaps?: number
          current_streak?: number
          custom_title?: string | null
          directory_visible?: boolean
          discoverable_by?: string
          discovery_radius_m?: number
          display_name?: string
          embedding?: string | null
          entity_types?: string[] | null
          feed_radius_m?: number
          gamification_access_override?: string | null
          ghost_mode?: boolean
          handle?: string
          header_image_url?: string | null
          home_geocell_lat?: number | null
          home_geocell_lng?: number | null
          home_geog?: unknown
          home_label?: string | null
          home_lat?: number | null
          home_lng?: number | null
          home_timezone?: string | null
          household_bundle_id?: string | null
          id?: string
          is_active?: boolean | null
          is_crew_lead?: boolean | null
          is_demo?: boolean
          is_founding_member?: boolean
          is_system?: boolean
          last_seen_at?: string | null
          lifetime_gems?: number
          lifetime_rank?: Database["public"]["Enums"]["season_rank_enum"]
          lifetime_zaps?: number
          live_lat?: number | null
          live_lng?: number | null
          live_updated_at?: string | null
          location_band?: string
          location_mode?: string
          locked_price_id?: string | null
          longest_streak?: number
          membership_payment_status?: string | null
          membership_tier?: string
          meta?: Json | null
          nexus_region_id?: string | null
          phone?: string | null
          profile_border?: string | null
          profile_flair?: string | null
          profile_theme?: string | null
          referred_by_profile_id?: string | null
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean
          stripe_customer_id?: string | null
          stripe_details_submitted?: boolean
          stripe_payouts_enabled?: boolean
          suspended_at?: string | null
          suspended_by?: string | null
          suspended_reason?: string | null
          suspended_until?: string | null
          updated_at?: string | null
          vcard?: Json
          web_role?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_household_bundle_id_fkey"
            columns: ["household_bundle_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_nexus_region_id_fkey"
            columns: ["nexus_region_id"]
            isOneToOne: false
            referencedRelation: "nexus_regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_referred_by_profile_id_fkey"
            columns: ["referred_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      program_adoptions: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          program_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          program_id: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          program_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_adoptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_adoptions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          adopt_count: number
          author_id: string | null
          body: string | null
          cover_image: string | null
          created_at: string
          id: string
          is_demo: boolean
          pillar: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          slug: string
          space_id: string | null
          status: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          adopt_count?: number
          author_id?: string | null
          body?: string | null
          cover_image?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          pillar?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          slug: string
          space_id?: string | null
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          adopt_count?: number
          author_id?: string | null
          body?: string | null
          cover_image?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          pillar?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          slug?: string
          space_id?: string | null
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programs_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
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
      qr_codes: {
        Row: {
          active: boolean
          alt_target_url: string | null
          campaign_id: string | null
          circle_id: string | null
          created_at: string
          created_by: string | null
          destination_type: string
          event_id: string | null
          flyer: Json
          id: string
          node_id: string | null
          owner_profile_id: string | null
          page_path: string | null
          partner_id: string | null
          purpose: string | null
          scan_count: number
          slug: string
          source_tag: string | null
          space_id: string | null
          splash: Json | null
          style: Json
          switch_at: string | null
          target_url: string | null
          template_id: string | null
          title: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          active?: boolean
          alt_target_url?: string | null
          campaign_id?: string | null
          circle_id?: string | null
          created_at?: string
          created_by?: string | null
          destination_type?: string
          event_id?: string | null
          flyer?: Json
          id?: string
          node_id?: string | null
          owner_profile_id?: string | null
          page_path?: string | null
          partner_id?: string | null
          purpose?: string | null
          scan_count?: number
          slug: string
          source_tag?: string | null
          space_id?: string | null
          splash?: Json | null
          style?: Json
          switch_at?: string | null
          target_url?: string | null
          template_id?: string | null
          title: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          active?: boolean
          alt_target_url?: string | null
          campaign_id?: string | null
          circle_id?: string | null
          created_at?: string
          created_by?: string | null
          destination_type?: string
          event_id?: string | null
          flyer?: Json
          id?: string
          node_id?: string | null
          owner_profile_id?: string | null
          page_path?: string | null
          partner_id?: string | null
          purpose?: string | null
          scan_count?: number
          slug?: string
          source_tag?: string | null
          space_id?: string | null
          splash?: Json | null
          style?: Json
          switch_at?: string | null
          target_url?: string | null
          template_id?: string | null
          title?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qr_codes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "entry_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_codes_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_codes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_codes_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_codes_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_codes_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_codes_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      qr_scans: {
        Row: {
          city: string | null
          country: string | null
          id: string
          lat: number | null
          lng: number | null
          medium: string
          profile_id: string | null
          qr_code_id: string
          scanned_at: string
          variant_key: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          medium?: string
          profile_id?: string | null
          qr_code_id: string
          scanned_at?: string
          variant_key?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          medium?: string
          profile_id?: string | null
          qr_code_id?: string
          scanned_at?: string
          variant_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qr_scans_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_scans_qr_code_id_fkey"
            columns: ["qr_code_id"]
            isOneToOne: false
            referencedRelation: "qr_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      quests: {
        Row: {
          accent: string | null
          created_at: string
          description: string | null
          emoji: string | null
          id: string
          is_demo: boolean
          name: string
          season: number | null
          slug: string
          sort_order: number
          status: string
        }
        Insert: {
          accent?: string | null
          created_at?: string
          description?: string | null
          emoji?: string | null
          id?: string
          is_demo?: boolean
          name: string
          season?: number | null
          slug: string
          sort_order?: number
          status?: string
        }
        Update: {
          accent?: string | null
          created_at?: string
          description?: string | null
          emoji?: string | null
          id?: string
          is_demo?: boolean
          name?: string
          season?: number | null
          slug?: string
          sort_order?: number
          status?: string
        }
        Relationships: []
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
      resonance_consent: {
        Row: {
          created_at: string
          opted_in: boolean
          opted_out_as_target: boolean
          profile_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          opted_in?: boolean
          opted_out_as_target?: boolean
          profile_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          opted_in?: boolean
          opted_out_as_target?: boolean
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resonance_consent_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      resonance_edges: {
        Row: {
          a_pid: string
          affinity: Json
          b_pid: string
          created_at: string
          expires_at: string
          reasons: Json
          score: number
          updated_at: string
        }
        Insert: {
          a_pid: string
          affinity?: Json
          b_pid: string
          created_at?: string
          expires_at: string
          reasons?: Json
          score?: number
          updated_at?: string
        }
        Update: {
          a_pid?: string
          affinity?: Json
          b_pid?: string
          created_at?: string
          expires_at?: string
          reasons?: Json
          score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resonance_edges_a_pid_fkey"
            columns: ["a_pid"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resonance_edges_b_pid_fkey"
            columns: ["b_pid"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      resonance_embeddings: {
        Row: {
          embedding: string | null
          profile_id: string
          updated_at: string
        }
        Insert: {
          embedding?: string | null
          profile_id: string
          updated_at?: string
        }
        Update: {
          embedding?: string | null
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resonance_embeddings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      resonance_matches: {
        Row: {
          a_optin: boolean
          a_pid: string
          accepted_at: string | null
          b_optin: boolean
          b_pid: string
          created_at: string
          updated_at: string
        }
        Insert: {
          a_optin?: boolean
          a_pid: string
          accepted_at?: string | null
          b_optin?: boolean
          b_pid: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          a_optin?: boolean
          a_pid?: string
          accepted_at?: string | null
          b_optin?: boolean
          b_pid?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resonance_matches_a_pid_fkey"
            columns: ["a_pid"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resonance_matches_b_pid_fkey"
            columns: ["b_pid"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_grants: {
        Row: {
          amount: number
          detail: string | null
          granted_at: string
          id: string
          profile_id: string
          reward_kind: string
          rule_key: string
        }
        Insert: {
          amount?: number
          detail?: string | null
          granted_at?: string
          id?: string
          profile_id: string
          reward_kind: string
          rule_key: string
        }
        Update: {
          amount?: number
          detail?: string | null
          granted_at?: string
          id?: string
          profile_id?: string
          reward_kind?: string
          rule_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_grants_profile_id_fkey"
            columns: ["profile_id"]
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
          embedding: string | null
          id: string
          media_url: string | null
          parent_id: string | null
          room_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          embedding?: string | null
          id?: string
          media_url?: string | null
          parent_id?: string | null
          room_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          embedding?: string | null
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
          creator_id: string | null
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
          creator_id?: string | null
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
          creator_id?: string | null
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
          is_active: boolean
          journey_id: string | null
          name: string
          season: number
          slug: string
          sort_order: number
          target: number
          valid_from: string | null
          valid_until: string | null
          zaps_reward: number
        }
        Insert: {
          category: Database["public"]["Enums"]["achievement_category"]
          created_at?: string
          criteria?: Json
          description: string
          difficulty?: Database["public"]["Enums"]["challenge_difficulty"]
          id?: string
          is_active?: boolean
          journey_id?: string | null
          name: string
          season?: number
          slug: string
          sort_order?: number
          target?: number
          valid_from?: string | null
          valid_until?: string | null
          zaps_reward?: number
        }
        Update: {
          category?: Database["public"]["Enums"]["achievement_category"]
          created_at?: string
          criteria?: Json
          description?: string
          difficulty?: Database["public"]["Enums"]["challenge_difficulty"]
          id?: string
          is_active?: boolean
          journey_id?: string | null
          name?: string
          season?: number
          slug?: string
          sort_order?: number
          target?: number
          valid_from?: string | null
          valid_until?: string | null
          zaps_reward?: number
        }
        Relationships: [
          {
            foreignKeyName: "season_challenges_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journey_plans"
            referencedColumns: ["id"]
          },
        ]
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
      segments: {
        Row: {
          created_at: string
          created_by: string | null
          definition: Json
          description: string | null
          id: string
          is_system: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          definition: Json
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          definition?: Json
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "segments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sequence_overrides: {
        Row: {
          audience: string | null
          created_at: string
          data: Json
          slug: string
          splash: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          audience?: string | null
          created_at?: string
          data?: Json
          slug: string
          splash?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          audience?: string | null
          created_at?: string
          data?: Json
          slug?: string
          splash?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sequence_overrides_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      space_availability: {
        Row: {
          created_at: string
          end_minute: number
          id: string
          slot_minutes: number
          space_id: string
          start_minute: number
          timezone: string
          weekday: number
        }
        Insert: {
          created_at?: string
          end_minute: number
          id?: string
          slot_minutes?: number
          space_id: string
          start_minute: number
          timezone?: string
          weekday: number
        }
        Update: {
          created_at?: string
          end_minute?: number
          id?: string
          slot_minutes?: number
          space_id?: string
          start_minute?: number
          timezone?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "space_availability_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_bookings: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          member_profile_id: string
          note: string | null
          space_id: string
          starts_at: string
          status: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          member_profile_id: string
          note?: string | null
          space_id: string
          starts_at: string
          status?: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          member_profile_id?: string
          note?: string | null
          space_id?: string
          starts_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_bookings_member_profile_id_fkey"
            columns: ["member_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_bookings_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_donation_asks: {
        Row: {
          created_at: string
          description: string | null
          fund_label: string
          id: string
          is_active: boolean
          space_id: string
          suggested_amounts_cents: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          fund_label: string
          id?: string
          is_active?: boolean
          space_id: string
          suggested_amounts_cents?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          fund_label?: string
          id?: string
          is_active?: boolean
          space_id?: string
          suggested_amounts_cents?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_donation_asks_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_email_templates: {
        Row: {
          body: string
          created_at: string
          id: string
          name: string
          space_id: string
          subject: string
          updated_at: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          name: string
          space_id: string
          subject?: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          name?: string
          space_id?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_email_templates_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_enrollments: {
        Row: {
          created_at: string
          enrolled_at: string
          id: string
          member_profile_id: string
          program_id: string
          space_id: string
          status: string
        }
        Insert: {
          created_at?: string
          enrolled_at?: string
          id?: string
          member_profile_id: string
          program_id: string
          space_id: string
          status?: string
        }
        Update: {
          created_at?: string
          enrolled_at?: string
          id?: string
          member_profile_id?: string
          program_id?: string
          space_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_enrollments_member_profile_id_fkey"
            columns: ["member_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_enrollments_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "space_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_enrollments_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_follows: {
        Row: {
          created_at: string
          follower_profile_id: string
          id: string
          space_id: string
        }
        Insert: {
          created_at?: string
          follower_profile_id: string
          id?: string
          space_id: string
        }
        Update: {
          created_at?: string
          follower_profile_id?: string
          id?: string
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_follows_follower_profile_id_fkey"
            columns: ["follower_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_follows_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_function_type_defaults: {
        Row: {
          enabled: boolean
          fn: string
          min_role: string
          type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          fn: string
          min_role?: string
          type: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          fn?: string
          min_role?: string
          type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "space_function_type_defaults_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      space_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: string
          space_id: string
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          space_id: string
          status?: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          space_id?: string
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_invites_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_members: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          profile_id: string
          role: string
          space_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          profile_id: string
          role?: string
          space_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          profile_id?: string
          role?: string
          space_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_members_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_membership_tiers: {
        Row: {
          benefits: Json
          created_at: string
          description: string | null
          id: string
          interval: string
          is_active: boolean
          name: string
          price_cents: number
          sort: number
          space_id: string
          stripe_product_id: string | null
        }
        Insert: {
          benefits?: Json
          created_at?: string
          description?: string | null
          id?: string
          interval?: string
          is_active?: boolean
          name: string
          price_cents?: number
          sort?: number
          space_id: string
          stripe_product_id?: string | null
        }
        Update: {
          benefits?: Json
          created_at?: string
          description?: string | null
          id?: string
          interval?: string
          is_active?: boolean
          name?: string
          price_cents?: number
          sort?: number
          space_id?: string
          stripe_product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "space_membership_tiers_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_memberships: {
        Row: {
          created_at: string
          id: string
          member_profile_id: string
          payment_status: string | null
          space_id: string
          started_at: string
          status: string
          stripe_subscription_id: string | null
          tier_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          member_profile_id: string
          payment_status?: string | null
          space_id: string
          started_at?: string
          status?: string
          stripe_subscription_id?: string | null
          tier_id: string
        }
        Update: {
          created_at?: string
          id?: string
          member_profile_id?: string
          payment_status?: string | null
          space_id?: string
          started_at?: string
          status?: string
          stripe_subscription_id?: string | null
          tier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_memberships_member_profile_id_fkey"
            columns: ["member_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_memberships_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_memberships_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "space_membership_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      space_programs: {
        Row: {
          capacity: number
          created_at: string
          description: string | null
          ends_on: string | null
          id: string
          is_published: boolean
          name: string
          schedule: string | null
          space_id: string
          starts_on: string | null
          updated_at: string
        }
        Insert: {
          capacity?: number
          created_at?: string
          description?: string | null
          ends_on?: string | null
          id?: string
          is_published?: boolean
          name: string
          schedule?: string | null
          space_id: string
          starts_on?: string | null
          updated_at?: string
        }
        Update: {
          capacity?: number
          created_at?: string
          description?: string | null
          ends_on?: string | null
          id?: string
          is_published?: boolean
          name?: string
          schedule?: string | null
          space_id?: string
          starts_on?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_programs_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_segments: {
        Row: {
          created_at: string
          definition: Json
          id: string
          name: string
          space_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          definition?: Json
          id?: string
          name: string
          space_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          definition?: Json
          id?: string
          name?: string
          space_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_segments_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_ticket_rsvps: {
        Row: {
          created_at: string
          id: string
          member_profile_id: string
          reserved_at: string
          space_id: string
          status: string
          tier_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          member_profile_id: string
          reserved_at?: string
          space_id: string
          status?: string
          tier_id: string
        }
        Update: {
          created_at?: string
          id?: string
          member_profile_id?: string
          reserved_at?: string
          space_id?: string
          status?: string
          tier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_ticket_rsvps_member_profile_id_fkey"
            columns: ["member_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_ticket_rsvps_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_ticket_rsvps_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "space_ticket_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      space_ticket_tiers: {
        Row: {
          capacity: number | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          kind: string
          name: string
          sort: number
          space_id: string
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          name: string
          sort?: number
          space_id: string
        }
        Update: {
          capacity?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          sort?: number
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_ticket_tiers_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      spaces: {
        Row: {
          about: string | null
          brand_accent: string | null
          brand_logo_url: string | null
          brand_name: string | null
          created_at: string
          domain: string | null
          email_enabled: boolean
          enabled_verticals: string[]
          entitlements: Json
          entity_id: string
          feature_roles: Json
          generation: string | null
          id: string
          name: string
          network_connected: boolean
          owner_profile_id: string | null
          plan: string | null
          skin: string
          slug: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tagline: string | null
          type: string
          updated_at: string
          visibility: string
        }
        Insert: {
          about?: string | null
          brand_accent?: string | null
          brand_logo_url?: string | null
          brand_name?: string | null
          created_at?: string
          domain?: string | null
          email_enabled?: boolean
          enabled_verticals?: string[]
          entitlements?: Json
          entity_id: string
          feature_roles?: Json
          generation?: string | null
          id?: string
          name: string
          network_connected?: boolean
          owner_profile_id?: string | null
          plan?: string | null
          skin?: string
          slug: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tagline?: string | null
          type: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          about?: string | null
          brand_accent?: string | null
          brand_logo_url?: string | null
          brand_name?: string | null
          created_at?: string
          domain?: string | null
          email_enabled?: boolean
          enabled_verticals?: string[]
          entitlements?: Json
          entity_id?: string
          feature_roles?: Json
          generation?: string | null
          id?: string
          name?: string
          network_connected?: boolean
          owner_profile_id?: string | null
          plan?: string | null
          skin?: string
          slug?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tagline?: string | null
          type?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "spaces_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spaces_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      stewardships: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          role: string
          scope_id: string
          scope_type: string
          state: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          role: string
          scope_id: string
          scope_type: string
          state?: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          role?: string
          scope_id?: string
          scope_type?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "stewardships_profile_id_fkey"
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
          expires_at: string | null
          gem_cost: number
          icon: string
          id: string
          is_active: boolean
          metadata: Json
          name: string
          preview: string | null
          season_id: number | null
          slug: string
          sort_order: number
          stock: number | null
        }
        Insert: {
          category: Database["public"]["Enums"]["store_category"]
          created_at?: string
          description: string
          expires_at?: string | null
          gem_cost: number
          icon?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          preview?: string | null
          season_id?: number | null
          slug: string
          sort_order?: number
          stock?: number | null
        }
        Update: {
          category?: Database["public"]["Enums"]["store_category"]
          created_at?: string
          description?: string
          expires_at?: string | null
          gem_cost?: number
          icon?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          preview?: string | null
          season_id?: number | null
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
      stripe_webhook_events: {
        Row: {
          event_id: string
          received_at: string
          type: string
        }
        Insert: {
          event_id: string
          received_at?: string
          type: string
        }
        Update: {
          event_id?: string
          received_at?: string
          type?: string
        }
        Relationships: []
      }
      studio_site_changes: {
        Row: {
          action_key: string
          actor_id: string | null
          created_at: string
          detail: string | null
          id: string
          params: Json
          rec_id: string | null
          reverted_at: string | null
          status: string
        }
        Insert: {
          action_key: string
          actor_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          params?: Json
          rec_id?: string | null
          reverted_at?: string | null
          status?: string
        }
        Update: {
          action_key?: string
          actor_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          params?: Json
          rec_id?: string | null
          reverted_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_site_changes_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_messages: {
        Row: {
          author_id: string | null
          author_kind: string
          body: string
          created_at: string
          id: string
          is_internal: boolean
          ticket_id: string
        }
        Insert: {
          author_id?: string | null
          author_kind?: string
          body: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id: string
        }
        Update: {
          author_id?: string | null
          author_kind?: string
          body?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          context: Json
          created_at: string
          id: string
          last_activity_at: string
          page_url: string | null
          priority: string
          profile_id: string
          ref: number
          resolved_at: string | null
          screenshot_path: string | null
          status: string
          subject: string
          type: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          context?: Json
          created_at?: string
          id?: string
          last_activity_at?: string
          page_url?: string | null
          priority?: string
          profile_id: string
          ref?: number
          resolved_at?: string | null
          screenshot_path?: string | null
          status?: string
          subject: string
          type?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          context?: Json
          created_at?: string
          id?: string
          last_activity_at?: string
          page_url?: string | null
          priority?: string
          profile_id?: string
          ref?: number
          resolved_at?: string | null
          screenshot_path?: string | null
          status?: string
          subject?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_profile_id_fkey"
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
      themes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_default: boolean
          kind: string
          name: string
          slug: string
          status: string
          tokens: Json
          updated_at: string
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          kind?: string
          name: string
          slug: string
          status?: string
          tokens?: Json
          updated_at?: string
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          kind?: string
          name?: string
          slug?: string
          status?: string
          tokens?: Json
          updated_at?: string
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "themes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tips: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          from_profile_id: string | null
          id: string
          message: string | null
          platform_fee_cents: number
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          succeeded_at: string | null
          to_profile_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          from_profile_id?: string | null
          id?: string
          message?: string | null
          platform_fee_cents?: number
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          succeeded_at?: string | null
          to_profile_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          from_profile_id?: string | null
          id?: string
          message?: string | null
          platform_fee_cents?: number
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          succeeded_at?: string | null
          to_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tips_from_profile_id_fkey"
            columns: ["from_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tips_to_profile_id_fkey"
            columns: ["to_profile_id"]
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
          pillar_id: string | null
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
          pillar_id?: string | null
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
          pillar_id?: string | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "topical_channels_domain_id_fkey"
            columns: ["pillar_id"]
            isOneToOne: false
            referencedRelation: "pillars"
            referencedColumns: ["id"]
          },
        ]
      }
      training_paths: {
        Row: {
          assigned_at: string
          completed_at: string | null
          id: string
          profile_id: string
          role: Database["public"]["Enums"]["community_role"]
          started_at: string | null
          status: string
        }
        Insert: {
          assigned_at?: string
          completed_at?: string | null
          id?: string
          profile_id: string
          role: Database["public"]["Enums"]["community_role"]
          started_at?: string | null
          status?: string
        }
        Update: {
          assigned_at?: string
          completed_at?: string | null
          id?: string
          profile_id?: string
          role?: Database["public"]["Enums"]["community_role"]
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_paths_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trust_scores: {
        Row: {
          context: string
          profile_id: string
          score: number
          signal_count: number
          updated_at: string
        }
        Insert: {
          context: string
          profile_id: string
          score?: number
          signal_count?: number
          updated_at?: string
        }
        Update: {
          context?: string
          profile_id?: string
          score?: number
          signal_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trust_scores_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trust_signals: {
        Row: {
          context: string
          created_at: string
          id: string
          idempotency_key: string | null
          meta: Json
          profile_id: string
          signal_type: string
          source: string
          weight: number
        }
        Insert: {
          context?: string
          created_at?: string
          id?: string
          idempotency_key?: string | null
          meta?: Json
          profile_id: string
          signal_type: string
          source: string
          weight?: number
        }
        Update: {
          context?: string
          created_at?: string
          id?: string
          idempotency_key?: string | null
          meta?: Json
          profile_id?: string
          signal_type?: string
          source?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "trust_signals_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      vera_config: {
        Row: {
          config: Json
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config?: Json
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vera_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vera_dispatches: {
        Row: {
          action_href: string | null
          copy: string
          created_at: string
          day: string
          id: string
          kind: string
          payload: Json
          profile_id: string
        }
        Insert: {
          action_href?: string | null
          copy: string
          created_at?: string
          day: string
          id?: string
          kind: string
          payload?: Json
          profile_id: string
        }
        Update: {
          action_href?: string | null
          copy?: string
          created_at?: string
          day?: string
          id?: string
          kind?: string
          payload?: Json
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vera_dispatches_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      walkthrough: {
        Row: {
          active: boolean
          audience: string | null
          cadence: string
          created_at: string
          description: string | null
          ends_at: string | null
          id: string
          name: string
          priority: number
          slug: string
          starts_at: string | null
          steps: Json
          trigger: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          audience?: string | null
          cadence?: string
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          name: string
          priority?: number
          slug: string
          starts_at?: string | null
          steps?: Json
          trigger?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          audience?: string | null
          cadence?: string
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          name?: string
          priority?: number
          slug?: string
          starts_at?: string | null
          steps?: Json
          trigger?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "walkthrough_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      welcomes: {
        Row: {
          created_at: string
          id: string
          newcomer_id: string
          welcomer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          newcomer_id: string
          welcomer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          newcomer_id?: string
          welcomer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "welcomes_newcomer_id_fkey"
            columns: ["newcomer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "welcomes_welcomer_id_fkey"
            columns: ["welcomer_id"]
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
      zap_transactions: {
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
            foreignKeyName: "zap_transactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      member_engagement_scores: {
        Row: {
          activation_propensity: number | null
          churn_risk: string | null
          computed_at: string | null
          join_cohort: string | null
          last_active_at: string | null
          lifecycle_stage: string | null
          next_best_action: string | null
          profile_id: string | null
          resonance_health: number | null
          resonance_tier: string | null
          rfm_score: number | null
          wam_status: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "member_traits_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      practices_ranked: {
        Row: {
          adopters: number | null
          body: string | null
          cadence: string | null
          category: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          domain_id: string | null
          duration_min: number | null
          embedding: string | null
          featured_at: string | null
          focus_details: Json | null
          header_image: string | null
          icon: string | null
          id: string | null
          is_demo: boolean | null
          is_public: boolean | null
          is_template: boolean | null
          logs_30d: number | null
          logs_total: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          reward_note: string | null
          reward_zaps: number | null
          score: number | null
          status: string | null
          subcategory_id: string | null
          summary: string | null
          title: string | null
          uses_timer: boolean | null
          weight_class: string | null
        }
        Relationships: [
          {
            foreignKeyName: "practices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practices_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "pillars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practices_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practices_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "practice_subcategories"
            referencedColumns: ["id"]
          },
        ]
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
      adjust_ticket_sold: {
        Args: { p_delta: number; p_tier_id: string }
        Returns: undefined
      }
      am_participant: { Args: { p_conversation_id: string }; Returns: boolean }
      am_room_member: { Args: { p_room_id: string }; Returns: boolean }
      are_friends: { Args: { a: string; b: string }; Returns: boolean }
      can_read_event: { Args: { p_event_id: string }; Returns: boolean }
      can_view_space_content: { Args: { p_space_id: string }; Returns: boolean }
      can_write_space_content: {
        Args: { p_space_id: string }
        Returns: boolean
      }
      challenge_outcomes: {
        Args: never
        Returns: {
          challenge_id: string
          completed: number
          difficulty: string
          name: string
          started: number
        }[]
      }
      circle_momentum: {
        Args: { _circle: string }
        Returns: {
          members: number
          new_members_7d: number
          new_ties_7d: number
          upcoming_events: number
        }[]
      }
      circles_near: {
        Args: { _lat: number; _limit?: number; _lng: number }
        Returns: {
          about: string
          city: string
          distance_m: number
          id: string
          image_url: string
          latitude: number
          longitude: number
          member_cap: number
          member_count: number
          name: string
          neighborhood: string
          slug: string
          status: string
          type: string
        }[]
      }
      community_library: {
        Args: { _limit?: number; _pillar?: string; _type?: string }
        Returns: {
          adoptions: number
          author_id: string
          completions: number
          content_type: string
          cover_image: string
          created_at: string
          id: string
          pillar: string
          ratings: number
          score: number
          slug: string
          summary: string
          title: string
        }[]
      }
      dashboard_health_summary: {
        Args: never
        Returns: {
          at_risk_count: number
          cooling_count: number
          mean_health: number
          members: number
          resonant_count: number
          stage_activated: number
          stage_at_risk: number
          stage_dormant: number
          stage_engaged: number
          stage_new: number
          wam_count: number
        }[]
      }
      dashboard_space_health_summary: {
        Args: { _space_id: string }
        Returns: {
          at_risk_count: number
          cooling_count: number
          mean_health: number
          members: number
          resonant_count: number
          wam_count: number
        }[]
      }
      decrement_commerce_stock_atomic: {
        Args: { _order: string }
        Returns: undefined
      }
      density_by_city: {
        Args: never
        Returns: {
          active_circles: number
          capacity: number
          circle_members: number
          circles: number
          city: string
          listings: number
          new_residents_30d: number
          residents: number
        }[]
      }
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
      engagement_event_counts: {
        Args: { _days?: number }
        Returns: {
          actors: number
          event_type: string
          events: number
        }[]
      }
      engagement_prop_counts: {
        Args: { _days?: number; _event: string; _limit?: number; _prop: string }
        Returns: {
          n: number
          value: string
        }[]
      }
      ensure_calendar_token: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      event_calendar_feed: {
        Args: { _token: string }
        Returns: {
          description: string
          ends_at: string
          id: string
          is_cancelled: boolean
          location: string
          slug: string
          starts_at: string
          title: string
        }[]
      }
      event_id_for_post: { Args: { p_post_id: string }; Returns: string }
      feed_for_viewer: {
        Args: {
          _lat?: number
          _limit?: number
          _lng?: number
          _radius_m?: number
          _sort?: string
        }
        Returns: {
          author: Json
          body: string
          comment_count: number
          created_at: string
          distance_m: number
          engagement_score: number
          id: string
          is_demo: boolean
          is_pinned: boolean
          media_urls: string[]
          post_type: string
          reaction_count: number
          reactions: Json
          scope_id: string
          visibility: string
        }[]
      }
      find_contact_matches: {
        Args: { p_owner: string }
        Returns: {
          contact_id: string
          match_on: string
          profile_id: string
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
      get_my_web_role: { Args: never; Returns: string }
      gettransactionid: { Args: never; Returns: unknown }
      gift_gems_atomic: {
        Args: { _amount: number; _giver: string; _recipient: string }
        Returns: string
      }
      handle_is_available: { Args: { check_handle: string }; Returns: boolean }
      housing_match_candidates: {
        Args: { _limit?: number }
        Returns: {
          city: string
          listing_id: string
          owner_id: string
          rent_cents: number
          resonance: number
          score: number
        }[]
      }
      housing_rentals_near: {
        Args: {
          _lat: number
          _limit?: number
          _lng: number
          _max_rent_cents?: number
        }
        Returns: {
          city: string
          distance_band: string
          listing_id: string
          rent_cents: number
          room_type: string
          title: string
        }[]
      }
      interaction_surface_stats: {
        Args: { _days?: number; _limit?: number }
        Returns: {
          dwell_ms_avg: number
          events: number
          members: number
          rage_clicks: number
          scroll_avg: number
          surface: string
          views: number
        }[]
      }
      is_blocked_between: { Args: { a: string; b: string }; Returns: boolean }
      is_event_cohost: {
        Args: { p_event_id: string; p_profile_id: string }
        Returns: boolean
      }
      is_my_event: { Args: { p_event_id: string }; Returns: boolean }
      is_space_admin: { Args: { p_space_id: string }; Returns: boolean }
      is_space_member: { Args: { p_space_id: string }; Returns: boolean }
      longtransactionsenabled: { Args: never; Returns: boolean }
      match_help_chunks: {
        Args: {
          match_count?: number
          min_similarity?: number
          query_embedding: string
        }
        Returns: {
          category: string
          content: string
          heading: string
          similarity: number
          slug: string
        }[]
      }
      match_practices: {
        Args: {
          exclude_id?: string
          match_count?: number
          query_embedding: string
        }
        Returns: {
          id: string
          similarity: number
          title: string
        }[]
      }
      match_room_messages: {
        Args: {
          _room_id: string
          match_count?: number
          query_embedding: string
        }
        Returns: {
          author_id: string
          body: string
          created_at: string
          id: string
          similarity: number
        }[]
      }
      member_engagement_stats: {
        Args: never
        Returns: {
          created_at: string
          distinct_active_days_30: number
          event_count_30d: number
          first_verified_practice_at: string
          last_event_at: string
          profile_id: string
          verified_practices_7d: number
        }[]
      }
      member_interaction_stats: {
        Args: { _days?: number }
        Returns: {
          active_days: number
          dwell_ms: number
          interaction_count: number
          last_interaction_at: string
          profile_id: string
          scroll_avg: number
          sessions: number
          surfaces: number
        }[]
      }
      members_near: {
        Args: {
          _lat: number
          _limit?: number
          _lng: number
          _radius_m?: number
        }
        Returns: {
          avatar_url: string
          band: string
          community_role: string
          display_name: string
          handle: string
          profile_id: string
        }[]
      }
      message_peer_profiles: {
        Args: never
        Returns: {
          avatar_url: string
          display_name: string
          handle: string
          id: string
        }[]
      }
      mkt_content_performance: {
        Args: { _days?: number; _limit?: number }
        Returns: {
          author: string
          comments: number
          created_at: string
          engagement_score: number
          excerpt: string
          post_id: string
          reactions: number
        }[]
      }
      mkt_geo: {
        Args: never
        Returns: {
          circles: number
          city: string
          members: number
        }[]
      }
      mkt_growth: {
        Args: { _days?: number }
        Returns: {
          new_circles: number
          new_events: number
          new_members: number
          week: string
        }[]
      }
      mkt_interest_demand: {
        Args: never
        Returns: {
          circles: number
          interest: string
          interest_slug: string
          members: number
          pillar: string
          tune_ins: number
        }[]
      }
      mkt_leader_activity: {
        Args: never
        Returns: {
          circles: number
          last_event: string
          last_post: string
          leader: string
          lifetime_gems: number
          members: number
          profile_id: string
          role: string
          season_zaps: number
        }[]
      }
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
      my_orbit: {
        Args: { _limit?: number }
        Returns: {
          avatar_url: string
          co_events: number
          display_name: string
          handle: string
          how_met: string
          last_together: string
          met_at: string
          orbit: string
          profile_id: string
          resonance: number
          shared_circles: number
        }[]
      }
      my_unread_notification_count: { Args: never; Returns: number }
      near_misses: {
        Args: { _limit?: number }
        Returns: {
          avatar_url: string
          co_events: number
          display_name: string
          handle: string
          overlap: number
          profile_id: string
          shared_circles: number
        }[]
      }
      nearby_events: {
        Args: {
          _lat: number
          _limit?: number
          _long: number
          _radius_m?: number
        }
        Returns: {
          attendance_mode: string
          city: string
          country: string
          description: string
          distance_m: number
          ends_at: string
          id: string
          region: string
          slug: string
          starts_at: string
          title: string
          venue_name: string
        }[]
      }
      node_within_range: {
        Args: { p_lat: number; p_lng: number; p_node_id: string }
        Returns: boolean
      }
      nodes_geo: {
        Args: never
        Returns: {
          id: string
          lat: number
          lng: number
          proximity_m: number
        }[]
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
      profile_zap_total: { Args: { _profile: string }; Returns: number }
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
          price_cents: number
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
          price_cents: number
          slug: string
          starts_at: string
          title: string
        }[]
      }
      public_featured_posts: {
        Args: { _limit?: number }
        Returns: {
          author_avatar_url: string
          author_display_name: string
          author_handle: string
          body: string
          created_at: string
          featured_at: string
          id: string
          media_urls: string[]
        }[]
      }
      public_member_count: { Args: never; Returns: number }
      public_organizer_events: {
        Args: { _handle: string }
        Returns: {
          circle_id: string
          circle_name: string
          city: string
          description: string
          ends_at: string
          host_avatar_url: string
          host_display_name: string
          host_handle: string
          host_id: string
          id: string
          is_past: boolean
          slug: string
          starts_at: string
          title: string
        }[]
      }
      public_organizer_handles: {
        Args: { _limit?: number }
        Returns: {
          handle: string
          next_starts: string
        }[]
      }
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
      qr_stats_summary: { Args: { p_days?: number }; Returns: Json }
      recompute_community_level: {
        Args: { p_profile: string }
        Returns: undefined
      }
      record_qr_scan:
        | {
            Args: {
              p_city?: string
              p_code_id: string
              p_country?: string
              p_lat?: number
              p_lng?: number
              p_medium?: string
              p_profile?: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_city?: string
              p_code_id: string
              p_country?: string
              p_lat?: number
              p_lng?: number
              p_medium?: string
              p_profile?: string
              p_variant?: string
            }
            Returns: undefined
          }
      redeem_store_item_atomic: {
        Args: { _cost: number; _item: string; _profile: string }
        Returns: string
      }
      refresh_member_engagement_scores: { Args: never; Returns: undefined }
      relationship_timeline: {
        Args: { _limit?: number; _other: string }
        Returns: {
          at: string
          kind: string
          title: string
        }[]
      }
      reset_season: { Args: never; Returns: undefined }
      resonance_neighbors: {
        Args: { _limit?: number; _profile_id: string }
        Returns: {
          profile_id: string
          similarity: number
        }[]
      }
      scoped_feed_for_viewer: {
        Args: { _limit?: number; _scope_ids: string[]; _sort?: string }
        Returns: {
          author: Json
          body: string
          comment_count: number
          created_at: string
          engagement_score: number
          id: string
          is_demo: boolean
          is_pinned: boolean
          media_urls: string[]
          post_type: string
          reaction_count: number
          reactions: Json
          scope_id: string
          visibility: string
        }[]
      }
      search_handles_public: {
        Args: { q: string }
        Returns: {
          avatar_url: string
          display_name: string
          handle: string
          id: string
        }[]
      }
      set_event_geog: {
        Args: { _event_id: string; _lat: number; _long: number }
        Returns: undefined
      }
      set_node_geo: {
        Args: {
          p_lat: number
          p_lng: number
          p_node_id: string
          p_proximity_m: number
        }
        Returns: undefined
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
      visible_room_member_profiles: {
        Args: { _room_id: string }
        Returns: {
          avatar_url: string
          display_name: string
          handle: string
          id: string
          is_admin: boolean
          joined_at: string
        }[]
      }
      welcome_targets: {
        Args: { _days?: number; _limit?: number }
        Returns: {
          avatar_url: string
          display_name: string
          handle: string
          joined_at: string
          profile_id: string
          shared_circles: number
        }[]
      }
      your_impact: {
        Args: never
        Returns: {
          activated: number
          avg_days_to_activate: number
          brought: number
          catalysts: number
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
        | "admin"
        | "janitor"
      group_status: "forming" | "active" | "inactive" | "archived" | "draft"
      membership_status: "active" | "pending" | "inactive"
      post_type: "feed" | "blog" | "announcement" | "recap" | "note" | "system"
      post_visibility: "public" | "region" | "cluster" | "group"
      practice_mindless_mode:
        | "meditate"
        | "breathe"
        | "journal"
        | "stillness"
        | "ritual"
        | "log"
      practice_timer_kind: "none" | "mindless" | "movement"
      season_rank_enum: "ghost" | "initiate" | "adept" | "master"
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
      group_status: ["forming", "active", "inactive", "archived", "draft"],
      membership_status: ["active", "pending", "inactive"],
      post_type: ["feed", "blog", "announcement", "recap", "note", "system"],
      post_visibility: ["public", "region", "cluster", "group"],
      practice_mindless_mode: [
        "meditate",
        "breathe",
        "journal",
        "stillness",
        "ritual",
        "log",
      ],
      practice_timer_kind: ["none", "mindless", "movement"],
      season_rank_enum: ["ghost", "initiate", "adept", "master"],
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
