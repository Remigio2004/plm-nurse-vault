import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

export function PaginationBar({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            className={cn(
              "rounded-lg border border-transparent text-muted-foreground hover:border-border hover:bg-primary-soft hover:text-primary",
              page <= 1 && "pointer-events-none opacity-40",
            )}
            onClick={(e) => {
              e.preventDefault();
              if (page > 1) onChange(page - 1);
            }}
          />
        </PaginationItem>
        <PaginationItem>
          <span className="px-2 text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
        </PaginationItem>
        <PaginationItem>
          <PaginationNext
            href="#"
            className={cn(
              "rounded-lg border border-transparent text-muted-foreground hover:border-border hover:bg-primary-soft hover:text-primary",
              page >= totalPages && "pointer-events-none opacity-40",
            )}
            onClick={(e) => {
              e.preventDefault();
              if (page < totalPages) onChange(page + 1);
            }}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
