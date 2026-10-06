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
      audit_logs: {
        Row: {
          action: string
          details: Json | null
          id: string
          performed_by: string | null
          performed_by_email: string | null
          record_id: string | null
          record_summary: string
          timestamp: string
        }
        Insert: {
          action: string
          details?: Json | null
          id?: string
          performed_by?: string | null
          performed_by_email?: string | null
          record_id?: string | null
          record_summary: string
          timestamp?: string
        }
        Update: {
          action?: string
          details?: Json | null
          id?: string
          performed_by?: string | null
          performed_by_email?: string | null
          record_id?: string | null
          record_summary?: string
          timestamp?: string
        }
        Relationships: []
      }
      login_lockouts: {
        Row: {
          email: string | null
          failed_attempts: number
          ip_address: string
          locked_until: string | null
          updated_at: string
        }
        Insert: {
          email?: string | null
          failed_attempts?: number
          ip_address: string
          locked_until?: string | null
          updated_at?: string
        }
        Update: {
          email?: string | null
          failed_attempts?: number
          ip_address?: string
          locked_until?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      otp_codes: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          session_id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          expires_at: string
          id?: string
          session_id: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          session_id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      records: {
        Row: {
          batch: string
          cloudinary_public_id: string | null
          deleted_at: string | null
          file_name: string
          file_size: number | null
          file_type: string
          id: string
          status: string
          storage_path: string | null
          student_category: string
          student_name: string
          student_number: string
          updated_at: string
          uploaded_at: string
        }
        Insert: {
          batch: string
          cloudinary_public_id?: string | null
          deleted_at?: string | null
          file_name: string
          file_size?: number | null
          file_type: string
          id?: string
          status: string
          storage_path?: string | null
          student_category: string
          student_name: string
          student_number: string
          updated_at?: string
          uploaded_at?: string
        }
        Update: {
          batch?: string
          cloudinary_public_id?: string | null
          deleted_at?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string
          id?: string
          status?: string
          storage_path?: string | null
          student_category?: string
          student_name?: string
          student_number?: string
          updated_at?: string
          uploaded_at?: string
        }
        Relationships: []
      }
      student_documents: {
        Row: {
          cloudinary_public_id: string | null
          deleted_at: string | null
          document_type: string
          file_name: string
          file_size: number | null
          id: string
          storage_path: string | null
          student_id: string
          uploaded_at: string
        }
        Insert: {
          cloudinary_public_id?: string | null
          deleted_at?: string | null
          document_type: string
          file_name: string
          file_size?: number | null
          id?: string
          storage_path?: string | null
          student_id: string
          uploaded_at?: string
        }
        Update: {
          cloudinary_public_id?: string | null
          deleted_at?: string | null
          document_type?: string
          file_name?: string
          file_size?: number | null
          id?: string
          storage_path?: string | null
          student_id?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_documents_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_status_overrides: {
        Row: {
          document_type: string
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          document_type: string
          status: string
          student_id: string
          updated_at?: string
        }
        Update: {
          document_type?: string
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_status_overrides_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          batch: string
          classification: string
          created_at: string
          id: string
          student_name: string
          student_number: string | null
          updated_at: string
        }
        Insert: {
          batch: string
          classification: string
          created_at?: string
          id?: string
          student_name: string
          student_number?: string | null
          updated_at?: string
        }
        Update: {
          batch?: string
          classification?: string
          created_at?: string
          id?: string
          student_name?: string
          student_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      trusted_devices: {
        Row: {
          created_at: string
          device_label: string | null
          expires_at: string
          id: string
          revoked: boolean
          token_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_label?: string | null
          expires_at: string
          id?: string
          revoked?: boolean
          token_hash: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_label?: string | null
          expires_at?: string
          id?: string
          revoked?: boolean
          token_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      verified_sessions: {
        Row: {
          device_label: string | null
          expires_at: string
          revoked: boolean
          session_id: string
          user_id: string
          verified_at: string
        }
        Insert: {
          device_label?: string | null
          expires_at: string
          revoked?: boolean
          session_id: string
          user_id: string
          verified_at?: string
        }
        Update: {
          device_label?: string | null
          expires_at?: string
          revoked?: boolean
          session_id?: string
          user_id?: string
          verified_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
      is_session_verified: { Args: never; Returns: boolean }
      verify_record_passkey: {
        Args: { p_passkey?: string; p_record_id: string }
        Returns: {
          file_name: string
          file_size: number
          file_type: string
          storage_path: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
